// Two devices in Chromium against a local stand-in for Supabase (mock-supabase.mjs: PGlite running the real
// migrations, fake email sign-in). The laptop (1366 px) creates the cloud copy; the tablet (820 px, touch) links
// with a wrong then the right passphrase; names sync both ways; the tablet resets, re-links; the laptop deletes the
// cloud copy and the tablet locks. Sign-in is tried by typed code, by link into an open window and by link on a
// fresh load. Prints console errors, tap targets under 40 px, confirmations shown, and plaintext leaks.
// Never point this at the real Supabase project. See README.md here.
//   node scripts/sync-e2e/two-devices.mjs <dist built with the local URL> <folder for screenshots>
import { createRequire } from 'node:module'; import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url'; import path from 'node:path';
const { chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DIST = path.resolve(process.argv[2] ?? 'dist'), SP = path.resolve(process.argv[3] ?? '.');
const errors = [], dialogs = [];
const start = (args, ready) => new Promise(r => { const p = spawn('node', args); p.stdout.on('data', d => { if (String(d).includes(ready)) r(p); }); p.stderr.on('data', d => errors.push('server: ' + d)); });
const app = await start([`${HERE}/serve.mjs`, DIST, '4173'], 'serving');
const api = await start([`${HERE}/mock-supabase.mjs`, ROOT, '4174'], 'mock supabase');
const browser = await chromium.launch();
const open = async (name, opts) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.on('console', m => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', e => errors.push(`${name}: ${e}`));
  page.on('dialog', d => { dialogs.push(name + ': ' + d.message()); d.accept(); });
  await page.goto('http://localhost:4173/settings#sync');
  await page.getByText('Sync · tablet and laptop').waitFor();
  return page;
};
let n = 0; const modes = ['code', 'link-same-page', 'link-fresh-load']; // alternate: the laptop types the code, the tablet taps the link
const signIn = async page => {
  await page.getByLabel('Email').fill('me@example.com');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await page.getByText('Open the email on this device').waitFor();
  const mode = modes[n++] ?? 'code';
  if (mode === 'code') {
    await page.getByLabel('Code from the email').fill('123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
  } else {
    const { url } = await (await fetch('http://localhost:4174/__link?email=me@example.com')).json();
    if (mode === 'link-fresh-load') await page.goto('about:blank');
    await page.goto(url); // what tapping the link in the email does
    await page.waitForTimeout(1000);
    console.log(`${mode}: address bar afterwards:`, page.url());
  }
};
const tapTargets = async (page, name) => {
  const small = await page.evaluate(() => [...document.querySelectorAll('#sync button, #sync input, a[href="/settings#sync"]')]
    .map(e => ({ t: e.textContent?.trim() || e.getAttribute('aria-label') || e.tagName, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
    .filter(x => x.h > 0 && (x.h < 40 || x.w < 40)));
  console.log(`${name} tap targets under 40 px:`, small.length ? JSON.stringify(small) : 'none');
};
const hudName = page => page.locator('header').getByText(/· /).first().textContent();

const laptop = await open('laptop', { viewport: { width: 1366, height: 900 } });
await signIn(laptop);
await laptop.getByText('No cloud copy yet').waitFor();
await laptop.getByLabel('Passphrase', { exact: true }).fill('quiet marble pool at four');
await laptop.getByLabel('Passphrase again').fill('quiet marble pool at four');
await laptop.getByRole('button', { name: 'Encrypt and upload' }).click();
await laptop.getByText('Up to date').waitFor({ timeout: 20000 });
await laptop.locator('a[aria-label="Synced"]').waitFor();
await tapTargets(laptop, 'laptop');
await laptop.screenshot({ path: `${SP}/sync-laptop.png` });

const tablet = await open('tablet', { viewport: { width: 820, height: 1180 }, hasTouch: true });
await signIn(tablet);
await tablet.getByText('A cloud copy exists').waitFor();
await tablet.getByLabel('Passphrase').fill('wrong passphrase here');
await tablet.getByRole('button', { name: 'Link this device' }).click();
await tablet.getByText('That passphrase does not open the cloud copy').waitFor();
await tablet.getByLabel('Passphrase').fill('quiet marble pool at four');
const download = tablet.waitForEvent('download');
await tablet.getByRole('button', { name: 'Link this device' }).click();
console.log('tablet backup before linking:', (await download).suggestedFilename());
await tablet.getByText('Up to date').waitFor({ timeout: 20000 });
await tapTargets(tablet, 'tablet');
await tablet.screenshot({ path: `${SP}/sync-tablet.png` });

// A change on the laptop reaches the tablet, and one on the tablet reaches the laptop.
await laptop.getByLabel('Name').first().fill('Laptop Economist');
await laptop.waitForTimeout(4500); // 3 s debounce, then the push
await tablet.getByRole('button', { name: 'Sync now' }).click();
await tablet.locator('header').getByText('Laptop Economist').waitFor({ timeout: 10000 });
await tablet.getByLabel('Name').first().fill('Tablet Economist');
await tablet.waitForTimeout(4500);
await laptop.getByRole('button', { name: 'Sync now' }).click();
await laptop.locator('header').getByText('Tablet Economist').waitFor({ timeout: 10000 });
console.log('names synced both ways:', await hudName(laptop), '|', await hudName(tablet));

const rows0 = (await (await fetch('http://localhost:4174/__dump')).json()).rows.length;
// Reset the tablet: it erases the device only, signs it out, and leaves the cloud copy alone.
await tablet.getByRole('button', { name: 'Reset app' }).click();
await tablet.waitForURL('**/*'); await tablet.waitForTimeout(2500);
await tablet.goto('http://localhost:4173/settings#sync');
await tablet.getByLabel('Email').waitFor();
console.log('after reset: tablet signed out; cloud rows', rows0, '->', (await (await fetch('http://localhost:4174/__dump')).json()).rows.length);
await signIn(tablet);
await tablet.getByLabel('Passphrase').fill('quiet marble pool at four');
const dl2 = tablet.waitForEvent('download');
await tablet.getByRole('button', { name: 'Link this device' }).click();
await dl2;
await tablet.getByText('Up to date').waitFor({ timeout: 20000 });
console.log('tablet re-linked, name:', await hudName(tablet));
// The laptop deletes the cloud copy; the tablet finds out and offers to start again.
await laptop.getByRole('button', { name: 'Delete cloud copy' }).click();
await laptop.getByText('No cloud copy yet').waitFor();
await tablet.getByRole('button', { name: 'Sync now' }).click();
await tablet.getByText('The cloud copy was deleted or re-created').waitFor();
await tablet.locator('a[href="/settings#sync"]').screenshot({ path: SP + '/badge-locked.png' });
console.log('tablet badge:', await tablet.locator('a[href="/settings#sync"]').getAttribute('aria-label'));
await tablet.getByRole('button', { name: 'Link again' }).click();
await tablet.getByText('No cloud copy yet').waitFor();
await tapTargets(tablet, 'tablet (create)');
await tablet.screenshot({ path: SP + '/sync-tablet-create.png' });
console.log('dialogs:', JSON.stringify(dialogs, null, 1));
const dump = await (await fetch('http://localhost:4174/__dump')).json();
const text = JSON.stringify(dump.rows);
console.log('server rows:', dump.rows.length, '· plaintext leaks:', ['Economist', 'Banorte', 'CIDE', 'settings', 'playerName', 'seed-'].filter(s => text.includes(s)));
await tablet.goto('http://localhost:4173/');
await tablet.waitForTimeout(1500);
await tablet.screenshot({ path: `${SP}/sync-tablet-today.png` });
await browser.close(); app.kill(); api.kill();
console.log('console errors:', errors.length ? errors : 'none');
