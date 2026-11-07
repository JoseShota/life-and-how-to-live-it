// P2 sync: two simulated devices (each with its own fake IndexedDB and its own copy of the app's modules) against
// an in-memory server that follows the same rules as the Supabase functions.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeServer } from './helpers/fakeServer';
import type { Task } from '../src/db/types';

const PASS = 'correct horse battery staple';
const ITER = 1000; // the app uses 600,000; tests don't need to wait for it

async function device(server: FakeServer) {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.resetModules();
  const { db } = await import('../src/db/db');
  const { seedIfEmpty } = await import('../src/db/seed');
  const game = await import('../src/game/engine');
  const { createSyncEngine } = await import('../src/sync/engine');
  await seedIfEmpty();
  const sync = createSyncEngine(server.client());
  const snapshot = async () => {
    const out: Record<string, unknown[]> = {};
    for (const t of ['areas', 'tasks', 'habits', 'habitLogs', 'sessions', 'accounts', 'transactions', 'goals', 'xp', 'unlocked', 'rewards', 'opportunities'])
      out[t] = (await db.table(t).toArray()).map(r => ({ ...r, ts: undefined })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    out.settings = (await db.settings.toArray()).filter(s => !['activeTimer', 'lastBackupAt', 'showMarquee', 'lastExpenseCategory'].includes(s.key));
    return out;
  };
  return { db, game, sync, snapshot };
}
type Device = Awaited<ReturnType<typeof device>>;

/** A links first (uploads), B joins (takes the cloud copy). */
async function pair(server = new FakeServer()) {
  const a = await device(server);
  const b = await device(server);
  await a.sync.createCloud(PASS, ITER);
  expect(await b.sync.joinCloud(PASS)).toBe(true);
  return { server, a, b };
}

/** Sync both devices until neither has anything left to push (at most a few rounds). */
async function settle(...ds: Device[]) {
  for (let i = 0; i < 4; i++) {
    for (const d of ds) expect((await d.sync.syncNow()).status).toBe('idle');
  }
}

const quest = (id: string, areaId: string, extra: Partial<Task> = {}): Task =>
  ({ id, areaId, title: 'Grade midterms', difficulty: 3, priority: 1, status: 'todo', createdAt: 1, ...extra });

afterEach(() => { vi.useRealTimers(); });

describe('sync between two devices', () => {
  let s: Awaited<ReturnType<typeof pair>>;
  beforeEach(async () => { s = await pair(); });

  it('first sync: the second device takes the cloud copy, with no duplicates', async () => {
    expect(await s.b.snapshot()).toEqual(await s.a.snapshot());
    expect(await s.b.db.habits.count()).toBe(await s.a.db.habits.count());
    expect(await s.b.db.syncOutbox.count()).toBe(0);
  });

  it('create on A, edit on B, delete on A: both converge', async () => {
    const area = (await s.a.db.areas.toArray())[0].id;
    await s.a.db.tasks.add(quest('k1', area));
    await settle(s.a, s.b);
    expect(await s.b.db.tasks.get('k1')).toMatchObject({ title: 'Grade midterms' });
    await s.b.db.tasks.update('k1', { title: 'Grade finals' });
    await settle(s.b, s.a);
    expect(await s.a.db.tasks.get('k1')).toMatchObject({ title: 'Grade finals' });
    await s.a.db.tasks.delete('k1');
    await settle(s.a, s.b);
    expect(await s.b.db.tasks.get('k1')).toBeUndefined();
    expect(await s.b.snapshot()).toEqual(await s.a.snapshot());
  });

  it('edits on both devices: the later edit of a row wins everywhere; edits to different rows both survive', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const [g1, g2] = await s.a.db.goals.toArray();
    vi.setSystemTime(new Date(2026, 10, 7, 12, 0));
    await s.a.db.goals.update(g1.id, { current: 100 });
    vi.setSystemTime(new Date(2026, 10, 7, 12, 1));
    await s.b.db.goals.update(g1.id, { current: 200 }); // a minute later
    await s.b.db.goals.update(g2.id, { current: 7 });
    await settle(s.a, s.b);
    for (const d of [s.a, s.b]) {
      expect((await d.db.goals.get(g1.id))!.current).toBe(200);
      expect((await d.db.goals.get(g2.id))!.current).toBe(7);
    }
  });

  it('a device whose clock runs 10 minutes slow still wins with an edit made after it saw the other one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = new Date(2026, 10, 7, 12).getTime();
    const g = (await s.a.db.goals.toArray())[0];
    vi.setSystemTime(t0);
    await s.a.db.goals.update(g.id, { current: 1 });
    await s.a.sync.syncNow();
    vi.setSystemTime(t0 - 10 * 60_000); // B's clock is behind
    await s.b.sync.syncNow(); // B sees A's edit...
    await s.b.db.goals.update(g.id, { current: 2 }); // ...then edits after it
    await settle(s.b, s.a);
    expect((await s.a.db.goals.get(g.id))!.current).toBe(2);
    expect((await s.b.db.goals.get(g.id))!.current).toBe(2);
  });

  it('offline: changes wait in the outbox and go out on reconnect', async () => {
    const g = (await s.a.db.goals.toArray())[0];
    s.server.offline = true;
    await s.a.db.goals.update(g.id, { current: 42 });
    const r = await s.a.sync.syncNow();
    expect(r.status).toBe('offline');
    expect(r.pending).toBe(1);
    s.server.offline = false;
    await settle(s.a, s.b);
    expect((await s.b.db.goals.get(g.id))!.current).toBe(42);
  });

  it('a push that fails, or whose reply is lost, is safe to retry', async () => {
    const g = (await s.a.db.goals.toArray())[0];
    await s.a.db.goals.update(g.id, { current: 5 });
    s.server.failNextPush = 'before';
    expect((await s.a.sync.syncNow()).status).toBe('offline');
    s.server.failNextPush = 'after'; // stored, but A never hears back
    expect((await s.a.sync.syncNow()).status).toBe('offline');
    expect(await s.a.db.syncOutbox.count()).toBe(1);
    await settle(s.a, s.b);
    expect(await s.a.db.syncOutbox.count()).toBe(0);
    expect((await s.b.db.goals.get(g.id))!.current).toBe(5);
    expect(await s.b.snapshot()).toEqual(await s.a.snapshot());
  });

  it('the same quest completed on both devices pays its XP once', async () => {
    const area = (await s.a.db.areas.toArray())[0].id;
    await s.a.db.tasks.add(quest('k1', area));
    await settle(s.a, s.b);
    s.server.offline = true;
    await s.a.game.completeTask((await s.a.db.tasks.get('k1'))!);
    await s.b.game.completeTask((await s.b.db.tasks.get('k1'))!);
    s.server.offline = false;
    await settle(s.a, s.b);
    for (const d of [s.a, s.b]) expect(await d.db.xp.where('refId').equals('task:k1').count()).toBe(1);
    expect(await s.a.game.totals()).toEqual(await s.b.game.totals());
  });

  it('an undo (revoke) on one device removes the XP on the other', async () => {
    const area = (await s.a.db.areas.toArray())[0].id;
    await s.a.db.tasks.add(quest('k1', area));
    await s.a.game.completeTask((await s.a.db.tasks.get('k1'))!);
    await settle(s.a, s.b);
    expect((await s.b.game.totals()).xp).toBeGreaterThan(0);
    await s.a.game.reopenTask((await s.a.db.tasks.get('k1'))!);
    await settle(s.a, s.b);
    expect(await s.b.game.totals()).toEqual({ xp: 0, coins: 0 });
    expect(await s.b.db.tasks.get('k1')).toMatchObject({ status: 'todo' });
  });

  it('derived XP converges: focus logged on each device adds up to a full workday on both', async () => {
    const area = (await s.a.db.areas.toArray())[0].id;
    const wed = (h: number) => new Date(2026, 10, 4, h).getTime(); // a weekday: 6 h done, 8 h full
    s.server.offline = true;
    await s.a.game.logSession(area, wed(8), wed(12));
    await s.b.game.logSession(area, wed(13), wed(17));
    for (const d of [s.a, s.b]) expect(await d.db.xp.get('workday:2026-11-04')).toBeUndefined();
    s.server.offline = false;
    await settle(s.a, s.b);
    for (const d of [s.a, s.b]) {
      expect(await d.db.sessions.where('date').equals('2026-11-04').count()).toBe(2);
      expect(await d.db.xp.get('workday:2026-11-04')).toBeTruthy();
    }
    expect(await s.a.game.totals()).toEqual(await s.b.game.totals());
    expect(await s.b.snapshot()).toEqual(await s.a.snapshot());
  });

  it('once converged, another round sends nothing (no echo)', async () => {
    const area = (await s.a.db.areas.toArray())[0].id;
    await s.a.game.logSession(area, new Date(2026, 10, 4, 8).getTime(), new Date(2026, 10, 4, 15).getTime());
    const h = (await s.b.db.habits.where('key').equals('exercise').first())!;
    await s.b.game.setHabit(h, '2026-11-04', 1);
    await settle(s.a, s.b);
    const before = s.server.pushes;
    await s.a.sync.syncNow();
    await s.b.sync.syncNow();
    expect(s.server.pushes).toBe(before);
    expect(await s.a.db.syncOutbox.count()).toBe(0);
    expect(await s.b.db.syncOutbox.count()).toBe(0);
  });

  it('a tax quest filed on A is not reopened by B creating it at startup before it pulled', async () => {
    await s.a.db.settings.put({ key: 'taxProfile', value: { regime: 'resico' } });
    await settle(s.a, s.b);
    await s.a.game.ensureTaxQuests('2026-11-07');
    await s.a.game.completeTask((await s.a.db.tasks.get('tax-m-2026-10'))!);
    await s.b.game.ensureTaxQuests('2026-11-07'); // B hasn't pulled: it creates a fresh "to do" copy
    expect(await s.b.db.tasks.get('tax-m-2026-10')).toMatchObject({ status: 'todo' });
    await settle(s.b, s.a); // B even pushes first
    for (const d of [s.a, s.b]) expect(await d.db.tasks.get('tax-m-2026-10')).toMatchObject({ status: 'done' });
  });

  it('device-only settings stay on their device', async () => {
    await s.a.db.settings.put({ key: 'activeTimer', value: { areaId: 'x', start: 1 } });
    await s.a.db.settings.put({ key: 'teachingSchedule', value: { days: [2, 4] } });
    await settle(s.a, s.b);
    expect(await s.b.db.settings.get('activeTimer')).toBeUndefined();
    expect(await s.b.db.settings.get('teachingSchedule')).toMatchObject({ value: { days: [2, 4] } });
  });

  it('the server sees no table names, ids, amounts or text', async () => {
    const acc = (await s.a.db.accounts.toArray())[0];
    await s.a.db.transactions.add({ id: 'tx-secret', accountId: acc.id, date: '2026-11-05', amount: -1234.5, kind: 'expense', category: 'Rent', description: 'Departamento Coyoacán', createdAt: 1 });
    await settle(s.a, s.b);
    const dump = JSON.stringify([...s.server.records.values()]);
    for (const leak of ['tx-secret', 'Coyoac', '1234.5', 'transactions', 'Banorte', 'CIDE', 'seed-area', 'workTargets', 'settings'])
      expect(dump).not.toContain(leak);
    for (const r of s.server.records.values()) expect(r.rid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await s.b.db.transactions.get('tx-secret')).toMatchObject({ amount: -1234.5, description: 'Departamento Coyoacán' });
  });

  it('a device on an older schema stops and asks for an update instead of applying newer rows', async () => {
    const g = (await s.a.db.goals.toArray())[0];
    await s.a.db.goals.update(g.id, { current: 9 });
    await s.a.sync.syncNow();
    for (const r of s.server.records.values()) r.v = 99; // as if written by a newer app
    const r = await s.b.sync.syncNow();
    expect(r.status).toBe('update-needed');
    expect((await s.b.db.goals.get(g.id))!.current).not.toBe(9);
    s.server.schema = 99;
    await s.a.db.goals.update(g.id, { current: 10 });
    expect((await s.a.sync.syncNow()).status).toBe('update-needed');
  });

  it('a cloud copy re-created with another passphrase locks the other device until it joins again', async () => {
    await s.a.sync.deleteCloud();
    await s.a.sync.createCloud('another passphrase', ITER);
    expect((await s.b.sync.syncNow()).status).toBe('locked');
    expect(await s.b.sync.joinCloud(PASS)).toBe(false);
    expect(await s.b.sync.joinCloud('another passphrase')).toBe(true);
    await settle(s.a, s.b);
    expect(await s.b.snapshot()).toEqual(await s.a.snapshot());
  });

  it('pulls many pages', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `m:${i}`, ts: 1, date: '2026-11-01', source: 'manual' as const, refId: `m:${i}`, xp: 1, coins: 0, label: '' }));
    await s.a.db.xp.bulkPut(rows);
    await settle(s.a, s.b);
    expect(await s.b.db.xp.where('source').equals('manual').count()).toBe(1500);
  }, 30_000);
});

describe('linking', () => {
  it('a wrong passphrase changes nothing; a joining device keeps only its device-only settings', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    await a.db.goals.update((await a.db.goals.toArray())[0].id, { current: 77 });
    await a.sync.createCloud(PASS, ITER);
    await b.db.settings.put({ key: 'activeTimer', value: { areaId: 'x', start: 5 } });
    await b.db.goals.add({ id: 'only-on-b', name: 'B', icon: 'temple', target: 1, current: 0, order: 9 });
    expect(await b.sync.joinCloud('wrong')).toBe(false);
    expect(await b.db.goals.get('only-on-b')).toBeTruthy();
    expect(await b.sync.isLinked()).toBe(false);
    expect(await b.sync.joinCloud(PASS)).toBe(true);
    expect(await b.db.goals.get('only-on-b')).toBeUndefined(); // replaced by the cloud copy (the UI saves a backup first)
    expect(await b.db.settings.get('activeTimer')).toMatchObject({ value: { start: 5 } });
    expect(await b.snapshot()).toEqual(await a.snapshot());
  });

  it('a second device cannot create a second cloud copy', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    await a.sync.createCloud(PASS, ITER);
    await expect(b.sync.createCloud(PASS, ITER)).rejects.toMatchObject({ code: 'vault-exists' });
    expect(await b.sync.isLinked()).toBe(false);
  });
});
