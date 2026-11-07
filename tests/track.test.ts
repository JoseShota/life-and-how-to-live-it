import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, weakly } from '../src/db/db';
import { seedIfEmpty, seedId } from '../src/db/seed';
import { completeTask, evaluateDay, logSession, setHabit, award, revoke, redeem, ensureTaxQuests } from '../src/game/engine';
import { tagTransaction, isQuiet, nextHlc, newer, sameValue, quietly } from '../src/sync/track';
import { dateKey } from '../src/lib/util';

const pending = async () => (await db.syncOutbox.toArray()).sort((a, b) => a.id.localeCompare(b.id));
const pendingIds = async () => (await pending()).map(e => e.id);

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await db.syncOutbox.clear();
});

describe('change tracking (P2 sync)', () => {
  it('records adds, puts, updates and deletes, each with a newer clock', async () => {
    await db.goals.add({ id: 'g1', name: 'Fund', icon: 'temple', target: 100, current: 0, order: 0 });
    const a = (await db.syncOutbox.get('goals|g1'))!.hlc;
    await db.goals.update('g1', { current: 10 });
    const b = (await db.syncOutbox.get('goals|g1'))!.hlc;
    await db.goals.delete('g1');
    const c = (await db.syncOutbox.get('goals|g1'))!.hlc;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(await pendingIds()).toEqual(['goals|g1']); // repeated writes collapse into one entry
  });

  it('a write that changes nothing is not a change (no echo between devices)', async () => {
    await db.goals.put({ id: 'g1', name: 'Fund', icon: 'temple', target: 100, current: 0, order: 0 });
    await db.syncOutbox.clear();
    await db.goals.put({ id: 'g1', name: 'Fund', icon: 'temple', target: 100, current: 0, order: 0 });
    await db.goals.update('g1', { current: 0 });
    await db.goals.put({ id: 'g1', name: 'Fund', icon: 'temple', target: 100, current: 0, order: 0, deadline: undefined });
    expect(await db.syncOutbox.count()).toBe(0);
  });

  it('records deletes from where().delete(), clear() and bulkDelete, but not deletes of missing rows', async () => {
    await db.xp.bulkPut([
      { id: 'a:1', ts: 1, date: '2026-11-01', source: 'manual', refId: 'a:1', xp: 1, coins: 0, label: '' },
      { id: 'b:1', ts: 1, date: '2026-11-01', source: 'manual', refId: 'b:1', xp: 1, coins: 0, label: '' }
    ]);
    await db.sessions.bulkAdd([{ id: 's1', areaId: 'x', date: '2026-11-01', start: 0, end: 1, minutes: 1 }, { id: 's2', areaId: 'x', date: '2026-11-01', start: 2, end: 3, minutes: 1 }]);
    await db.syncOutbox.clear();
    await db.xp.where('refId').equals('a:1').delete();
    await db.sessions.clear();
    await db.goals.delete('nope');
    await db.areas.bulkDelete(['nope', 'nope2']);
    expect(await pendingIds()).toEqual(['sessions|s1', 'sessions|s2', 'xp|a:1']);
  });

  it('device-only settings never sync; the others do', async () => {
    await db.settings.put({ key: 'activeTimer', value: { areaId: 'a', start: 1 } });
    await db.settings.put({ key: 'lastBackupAt', value: 1 });
    await db.settings.put({ key: 'showMarquee', value: false });
    await db.settings.put({ key: 'lastExpenseCategory', value: 'Food' });
    await db.settings.put({ key: 'teachingSchedule', value: { days: [2, 4] } });
    await db.settings.put({ key: 'workTargets', value: { weekday: { done: 6, full: 8 } } });
    expect(await pendingIds()).toEqual(['settings|teachingSchedule', 'settings|workTargets']);
  });

  it('rows applied from a pull are not recorded and fire no toasts', async () => {
    let quiet: boolean | undefined;
    await db.transaction('rw', db.xp, async () => {
      tagTransaction(Dexie.currentTransaction, 'remote');
      quiet = isQuiet(Dexie.currentTransaction);
      await db.xp.put({ id: 'r:1', ts: 1, date: '2026-11-01', source: 'manual', refId: 'r:1', xp: 5, coins: 1, label: '' });
    });
    expect(quiet).toBe(true);
    expect(await db.xp.get('r:1')).toBeTruthy();
    expect(await db.syncOutbox.count()).toBe(0);
    expect(isQuiet(null)).toBe(false);
    await quietly(async () => { expect(isQuiet(null)).toBe(true); });
  });

  it('a failed or rolled-back write leaves no outbox entry', async () => {
    await db.goals.add({ id: 'g1', name: 'Fund', icon: 'temple', target: 100, current: 0, order: 0 });
    await db.syncOutbox.clear();
    await expect(db.goals.add({ id: 'g1', name: 'Dup', icon: 'temple', target: 1, current: 0, order: 0 })).rejects.toThrow();
    await expect(db.transaction('rw', db.goals, async () => {
      await db.goals.update('g1', { current: 50 });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await db.syncOutbox.count()).toBe(0);
    expect((await db.goals.get('g1'))!.current).toBe(0);
  });

  it('seed rows have the same ids on every device and are weak (any real edit wins)', async () => {
    await seedIfEmpty();
    expect(await db.habits.get(seedId('habit', 'sleep'))).toMatchObject({ key: 'sleep' });
    expect(await db.areas.get(seedId('area', 0))).toMatchObject({ short: 'CIDE' });
    const all = await pending();
    expect(all.length).toBeGreaterThan(30);
    expect(all.every(e => e.hlc === 0)).toBe(true);
    await db.areas.update(seedId('area', 0), { weeklyHoursTarget: 9 });
    expect((await db.syncOutbox.get(`areas|${seedId('area', 0)}`))!.hlc).toBeGreaterThan(0);
    // A later weak write to the same row never lowers the pending real change.
    await weakly(() => db.areas.update(seedId('area', 0), { weeklyHoursTarget: 10 }));
    expect((await db.syncOutbox.get(`areas|${seedId('area', 0)}`))!.hlc).toBeGreaterThan(0);
  });

  it('startup tax quests are weak, so they never overwrite a quest filed on the other device', async () => {
    await seedIfEmpty();
    await db.settings.put({ key: 'taxProfile', value: { regime: 'resico' } });
    await db.syncOutbox.clear();
    await ensureTaxQuests('2026-11-07');
    const tax = (await pending()).filter(e => e.k.startsWith('tax-m-'));
    expect(tax.length).toBeGreaterThan(0);
    expect(tax.every(e => e.hlc === 0)).toBe(true);
  });
});

describe('the ledger with deterministic ids (v13)', () => {
  beforeEach(async () => { await seedIfEmpty(); });

  it('the same award twice is one row, and a revoke is a recorded delete', async () => {
    await award('manual', 'x:1', 10, 'once');
    await award('manual', 'x:1', 10, 'once');
    expect(await db.xp.where('refId').equals('x:1').count()).toBe(1);
    expect(await db.xp.get('x:1')).toMatchObject({ xp: 10 });
    await db.syncOutbox.clear();
    await revoke('x:1');
    expect(await pendingIds()).toEqual(['xp|x:1']);
  });

  it('awards, achievements, shields and rewards all use the refId as id', async () => {
    const area = (await db.areas.toArray())[0];
    const task = { id: 'k1', areaId: area.id, title: 'x', difficulty: 3 as const, priority: 1 as const, status: 'todo' as const, createdAt: 1 };
    await db.tasks.add(task);
    await completeTask(task);
    const h = (await db.habits.where('key').equals('exercise').first())!;
    await setHabit(h, dateKey(), 1);
    await db.xp.put({ id: 'seed:coins', ts: 1, date: dateKey(), source: 'manual', refId: 'seed:coins', xp: 0, coins: 500, label: '' });
    const ref = await redeem((await db.rewards.toArray())[0].id);
    const rows = await db.xp.toArray();
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) expect(r.id).toBe(r.refId);
    expect(rows.some(r => r.refId.startsWith('ach:'))).toBe(true);
    expect(ref && (await db.xp.get(ref))).toBeTruthy();
  });

  it('re-evaluating a day that has not changed writes nothing', async () => {
    const area = (await db.areas.toArray())[0];
    const start = new Date(2026, 10, 4, 8).getTime();
    await logSession(area.id, start, start + 7 * 3600e3);
    await db.syncOutbox.clear();
    await evaluateDay('2026-11-04');
    await evaluateDay('2026-11-04');
    expect(await db.syncOutbox.count()).toBe(0);
  });
});

describe('clock', () => {
  it('never goes backwards, follows the server offset, and breaks ties by device', () => {
    expect(nextHlc({ hlc: 0, offset: 0 }, 1000)).toBe(1_000_000);
    expect(nextHlc({ hlc: 5_000_000, offset: 0 }, 1000)).toBe(5_000_001); // a clock set back can't go backwards
    expect(nextHlc({ hlc: 0, offset: 500 }, 1000)).toBe(1_500_000);
    expect(newer({ hlc: 2 }, { hlc: 1 })).toBe(true);
    expect(newer({ hlc: 1, dev: 'b' }, { hlc: 1, dev: 'a' })).toBe(true);
    expect(newer({ hlc: 1, dev: 'a' }, { hlc: 1, dev: 'a' })).toBe(false);
  });

  it('sameValue treats undefined properties as missing', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: [1, { c: 2 }] }, { a: [1, { c: 2 }] })).toBe(true);
    expect(sameValue({ a: [1] }, { a: [1, 2] })).toBe(false);
    expect(sameValue({ a: 0 }, { a: null })).toBe(false);
  });
});
