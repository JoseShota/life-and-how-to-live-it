// Control → Sync (P2): sign in with an emailed code, create or link the encrypted cloud copy, see the status.
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { db } from '@/db/db';
import { exportAll, download } from '@/lib/backup';
import { useToast } from '@/lib/toast';
import { dateKey } from '@/lib/util';
import { loadSync, syncConfigured, useSyncInfo, type SyncInfo } from '@/sync/status';
import type { Session } from '@/sync/supabase';
import { Glyph } from './Glyph';
import { Button, Card, Input, Label } from './ui';

type Runtime = Awaited<ReturnType<typeof loadSync>>;
const MIN_PASSPHRASE = 12;

export function SyncCard() {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (location.hash === '#sync') ref.current?.scrollIntoView({ block: 'start' }); }, [location.hash]);
  return (
    <div ref={ref} id="sync" className="scroll-mt-24">
      <Card title="Sync · tablet and laptop">
        {syncConfigured ? <SyncBody /> : <p className="text-sm text-ink/60">This build has no sync server. It needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>docs/07-DEPLOY.md</code>).</p>}
      </Card>
    </div>
  );
}

function SyncBody() {
  const toast = useToast();
  const info = useSyncInfo();
  const [rt, setRt] = useState<Runtime | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const session = useLiveQuery(() => db.syncState.get('session'), [], undefined)?.value as Session | undefined;
  const linked = !!useLiveQuery(() => db.syncState.get('vaultId'), [], undefined);
  const [cloud, setCloud] = useState<'unknown' | 'none' | 'exists'>('unknown');

  useEffect(() => { loadSync().then(setRt).catch(e => toast(String(e), 'bad')); }, [toast]);
  useEffect(() => {
    if (!rt || !session || linked) return;
    rt.engine.cloudExists().then(x => setCloud(x ? 'exists' : 'none')).catch(e => toast(String((e as Error).message ?? e), 'bad'));
  }, [rt, session, linked, toast]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast(String((e as Error).message ?? e), 'bad'); } finally { setBusy(null); }
  };

  if (!rt) return <p className="text-sm text-ink/60">Loading…</p>;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink/70">Your tablet and laptop keep the same data. Everything is encrypted on the device with a passphrase only you know: the server stores unreadable bytes, never your money, schedule or quests. The running timer and display settings stay on each device.</p>
      {!session ? <SignIn rt={rt} busy={busy} run={run} linked={linked} />
        : linked ? <Linked rt={rt} info={info} session={session} busy={busy} run={run} />
        : cloud === 'none' ? <CreateCloud rt={rt} busy={busy} run={run} />
        : cloud === 'exists' ? <JoinCloud rt={rt} busy={busy} run={run} />
        : <p className="text-ink/60">Looking for your cloud copy…</p>}
    </div>
  );
}

type StepProps = { rt: Runtime; busy: string | null; run: (label: string, fn: () => Promise<void>) => Promise<void> };

function SignIn({ rt, busy, run, linked }: StepProps & { linked: boolean }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  return (
    <div className="flex flex-col gap-3">
      {linked && <p className="font-display text-hp">Signed out: sign in again to keep syncing. Your data is safe on this device.</p>}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <Label text="Email"><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></Label>
        <Button variant="ghost" disabled={!email.includes('@') || !!busy} onClick={() => run('send', async () => { await rt.supabase.sendCode(email); setSent(true); toast('Code sent. Check your email.', 'gold'); })}>
          <Glyph name="scroll" size={16} />{busy === 'send' ? 'Sending…' : sent ? 'Send again' : 'Email me a code'}
        </Button>
      </div>
      {sent && (
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Label text="Code from the email"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></Label>
          <Button disabled={code.length < 6 || !!busy} onClick={() => run('verify', async () => { await rt.supabase.verifyCode(email, code); if (linked) rt.start(); })}>
            {busy === 'verify' ? 'Checking…' : 'Sign in'}
          </Button>
        </div>
      )}
    </div>
  );
}

function PassphraseHelp() {
  return <p className="text-xs text-ink/60">Use at least {MIN_PASSPHRASE} characters; four or more unrelated words work well. It never leaves your devices. If you forget it, the cloud copy can't be read by anyone, you included; your devices and backup files still have everything, and you can create the cloud copy again.</p>;
}

function CreateCloud({ rt, busy, run }: StepProps) {
  const toast = useToast();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const ok = p1.length >= MIN_PASSPHRASE && p1 === p2;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display">No cloud copy yet. This device will be the first: choose a passphrase.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text="Passphrase"><Input type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} /></Label>
        <Label text="Passphrase again"><Input type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></Label>
      </div>
      {p2 && p1 !== p2 && <p className="text-xs text-hp">The two passphrases differ.</p>}
      <PassphraseHelp />
      <div><Button disabled={!ok || !!busy} onClick={() => run('create', async () => {
        const r = await rt.engine.createCloud(p1);
        rt.start();
        toast(r.status === 'idle' ? 'Cloud copy created and encrypted' : 'Cloud copy created; the upload will finish when online', 'gold');
      })}><Glyph name="lock" size={16} />{busy === 'create' ? 'Encrypting…' : 'Encrypt and upload'}</Button></div>
    </div>
  );
}

function JoinCloud({ rt, busy, run }: StepProps) {
  const toast = useToast();
  const [p, setP] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display">A cloud copy exists. Link this device with your passphrase.</p>
      <p className="text-ink/70">This device's data will be <b>replaced</b> by the cloud copy. A backup file of this device is downloaded first, so nothing is lost.</p>
      <Label text="Passphrase"><Input type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></Label>
      <div><Button disabled={!p || !!busy} onClick={() => run('join', async () => {
        if (!confirm('Replace the data on this device with the cloud copy? A backup file of this device is saved first.')) return;
        const ok = await rt.engine.joinCloud(p, async () => {
          download(`life-backup-before-sync-${dateKey()}.json`, JSON.stringify(await exportAll()));
        });
        if (!ok) { toast('That passphrase does not open the cloud copy', 'bad'); return; }
        rt.start();
        toast('Linked. This device now syncs.', 'gold');
      })}><Glyph name="lock" size={16} />{busy === 'join' ? 'Unlocking…' : 'Link this device'}</Button></div>
    </div>
  );
}

const ago = (t?: number) => {
  if (!t) return 'not yet';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
};

function Linked({ rt, info, session, busy, run }: StepProps & { info: SyncInfo; session: Session }) {
  const toast = useToast();
  const line = {
    off: 'Starting…', idle: info.pending ? `${info.pending} change${info.pending === 1 ? '' : 's'} waiting` : 'Up to date', syncing: 'Syncing…',
    offline: `Offline. ${info.pending} change${info.pending === 1 ? '' : 's'} will go out when the connection returns.`,
    auth: 'Signed out: sign in again.', locked: 'The cloud copy was deleted or re-created with another passphrase. Link this device again.',
    'update-needed': 'The other device runs a newer version of the app. Reload to update, then sync resumes.',
    'vault-exists': 'Another device created the cloud copy first.', server: `Sync error: ${info.message ?? 'unknown'}`
  }[info.status];
  const bad = ['locked', 'update-needed', 'server', 'auth'].includes(info.status);
  return (
    <div className="flex flex-col gap-3">
      <div className="mac-inset flex items-center gap-3 bg-white px-3 py-2">
        <Glyph name={bad ? 'cloudAlert' : info.status === 'offline' ? 'cloudOff' : 'cloudCheck'} size={22} className={bad ? 'text-hp' : 'text-cyan'} />
        <div className="min-w-0">
          <p className={bad ? 'font-display text-hp' : 'font-display'}>{line}</p>
          <p className="text-xs text-ink/60">Last synced {ago(info.lastSyncedAt)} · {session.email}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {info.status === 'update-needed'
          ? <Button onClick={() => location.reload()}>Reload to update</Button>
          : info.status === 'locked'
            ? <Button onClick={() => run('relink', async () => { await rt.engine.unlink(); })}>Link again</Button>
            : <Button disabled={!!busy || info.status === 'syncing'} onClick={() => run('sync', async () => { const r = await rt.engine.syncNow(); if (r.status === 'idle') toast('Synced', 'gold'); })}><Glyph name="cloud" size={16} />Sync now</Button>}
        <Button variant="ghost" disabled={!!busy} onClick={() => run('signout', async () => {
          if (!confirm('Stop syncing on this device? Its data stays here, and the cloud copy stays for your other device.')) return;
          await rt.engine.unlink();
          await rt.supabase.signOut();
        })}>Stop syncing here</Button>
      </div>
    </div>
  );
}
