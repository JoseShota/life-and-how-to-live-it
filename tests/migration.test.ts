import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';
import { LifeDB, migrateWorkTargetsV12, rekeyXpV13 } from '../src/db/db';

/** Opens a database exactly as the deployed app (schema v2) left it, then upgrades it with today's LifeDB. */
describe('upgrade from the deployed schema (v2 → latest)', () => {
  it('keeps data and applies every migration', async () => {
    const name = 'upgrade-test';
    const old = new Dexie(name);
    old.version(1).stores({
      areas: 'id, order', tasks: 'id, areaId, status, dueDate, priority, completedAt', habits: 'id, &key, order',
      habitLogs: 'id, habitId, date, [habitId+date]', sessions: 'id, areaId, date, start', accounts: 'id, order',
      transactions: 'id, accountId, date, kind, areaId, transferId', goals: 'id, order', opportunities: 'id, status',
      rewards: 'id', xp: 'id, date, source, refId, ts', unlocked: 'key', settings: 'key'
    });
    old.version(2).stores({});
    await old.open();
    await old.table('habits').bulkAdd([
      { id: 'h1', key: 'wake', name: 'Up by 5:45', icon: 'sunrise', kind: 'check', xp: 20, core: true, order: 0, archived: false },
      { id: 'h2', key: 'intel', name: 'Newsletters', icon: 'scroll', kind: 'check', xp: 15, core: true, order: 4, archived: false },
      { id: 'h3', key: 'work', name: 'Deep work 8 h', icon: 'anvil', kind: 'auto', target: 8, unit: 'h', xp: 40, core: true, order: 5, archived: false }
    ]);
    await old.table('accounts').bulkAdd([
      { id: 'c1', name: 'Banorte Crédito 1', institution: 'Banorte', type: 'credit', creditLimit: 30000, cutoffDay: 1, paymentDueDay: 21, openingBalance: -8000, color: '#000', archived: false, order: 1 },
      { id: 'd1', name: 'Banorte Débito', institution: 'Banorte', type: 'debit', openingBalance: 5000, color: '#000', archived: false, order: 0 }
    ]);
    await old.table('transactions').add({ id: 't1', accountId: 'd1', date: '2026-11-01', amount: -230, kind: 'expense', category: 'Food', createdAt: 1 });
    await old.table('xp').add({ id: 'x1', ts: 1, date: '2026-11-01', source: 'workday', refId: 'workday:2026-11-01', xp: 100, coins: 20, label: 'Full workday' });
    await old.table('settings').put({ key: 'workTargetHours', value: 8 });
    await old.table('tasks').bulkAdd([
      { id: 'tax-m-2026-10', areaId: 'a', title: 'Declaración mensual RESICO · octubre 2026', difficulty: 2, priority: 2, dueDate: '2026-11-17', status: 'todo', createdAt: 1, notes: 'Estimate: ISR $100.00 + IVA $0.00 = $100.00 (income collected $10,000.00 at 1.00 %). File even if it\'s zero. Pay from the tax reserve.' },
      { id: 'tax-m-2026-09', areaId: 'a', title: 'Declaración mensual RESICO · septiembre 2026', difficulty: 2, priority: 2, dueDate: '2026-10-17', status: 'done', createdAt: 1, completedAt: 2, notes: 'paid with my línea de captura' },
      { id: 'k1', areaId: 'a', title: 'Grade midterms', difficulty: 3, priority: 1, status: 'done', createdAt: 1, completedAt: 2 }
    ]);
    old.close();

    const db = new LifeDB(name);
    await db.open();
    expect(db.verno).toBe(13);
    const habits = await db.habits.toArray();
    const by = (k: string) => habits.find(h => h.key === k)!;
    expect(by('wake').core).toBe(false);
    expect(by('intel')).toMatchObject({ core: false, intrinsic: true });
    expect(by('work')).toMatchObject({ core: true, name: 'Deep work', minLabel: '2 h of focus' });
    expect(by('eat')).toMatchObject({ core: false });
    expect(await db.settings.get('workTargets')).toMatchObject({ value: { weekday: { done: 6, full: 8 }, weekend: { done: 4, full: 6 }, teaching: { done: 4, full: 5 } } }); // v3 + v12
    expect(await db.accounts.get('c1')).toMatchObject({ bank: 'banorte', dueDaysAfterCutoff: 20, creditLimit: 30000 });
    expect((await db.accounts.get('d1'))!.role).toBe('operating');
    // Existing data is untouched: the ledger history and the transaction are still there (v13: id = refId).
    expect(await db.xp.get('workday:2026-11-01')).toMatchObject({ xp: 100, refId: 'workday:2026-11-01' });
    expect(await db.transactions.get('t1')).toMatchObject({ amount: -230 });
    expect(await db.statements.count()).toBe(0);
    expect(await db.pipelineEvents.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0); // v8
    // v9: the tax quest joins the monthly series; other quests are untouched.
    expect(await db.tasks.get('tax-m-2026-10')).toMatchObject({ recurrence: { every: 'month', series: 'tax-m', keepMissed: true }, dueDate: '2026-11-17' });
    expect(await db.tasks.get('k1')).toMatchObject({ title: 'Grade midterms', status: 'done', completedAt: 2 });
    expect((await db.tasks.get('k1'))!.recurrence).toBeUndefined();
    expect(await db.areaHours.count()).toBe(0); // v10
    // v11: the app's estimate leaves `notes`; a note the user wrote stays.
    expect(await db.tasks.get('tax-m-2026-10')).toMatchObject({ autoNotes: expect.stringMatching(/^Estimate: ISR \$100/) });
    expect((await db.tasks.get('tax-m-2026-10'))!.notes).toBeUndefined();
    expect(await db.tasks.get('tax-m-2026-09')).toMatchObject({ notes: 'paid with my línea de captura', status: 'done' });
    expect((await db.transactions.get('t1'))!.areaId).toBeUndefined(); // untagged expenses stay untagged
    expect(await db.settings.get('teachingSchedule')).toBeUndefined(); // v12: empty until the user enters it
    db.close();
  });
});

/** v11 → v12: targets the user edited survive and gain the teaching pair; everything else is untouched. */
describe('upgrade from v11 (teaching-day targets)', () => {
  it('adds the teaching pair and keeps the user\'s numbers and data', async () => {
    const name = 'upgrade-v11-test';
    const old = new Dexie(name);
    old.version(11).stores({
      areas: 'id, order', tasks: 'id, areaId, status, dueDate, priority, completedAt', habits: 'id, &key, order',
      habitLogs: 'id, habitId, date, [habitId+date]', sessions: 'id, areaId, date, start', accounts: 'id, order',
      transactions: 'id, accountId, date, kind, areaId, transferId', goals: 'id, order', opportunities: 'id, status',
      rewards: 'id', xp: 'id, date, source, refId, ts', unlocked: 'key', settings: 'key',
      statements: 'id, accountId, cutoffDate, dueDate', installments: 'id, accountId, txId',
      pipelineEvents: 'id, date, kind, opportunityId', reviews: 'id', areaHours: 'id, areaId, date'
    });
    await old.open();
    await old.table('settings').bulkPut([
      { key: 'workTargets', value: { weekday: { done: 5, full: 7 }, weekend: { done: 3, full: 5 } } },
      { key: 'playerName', value: 'P' }
    ]);
    await old.table('sessions').add({ id: 's1', areaId: 'a', date: '2026-11-02', start: 1, end: 2, minutes: 300 });
    await old.table('areaHours').add({ id: 'h1', areaId: 'a', date: '2026-09-01', hours: 6, weekly: true, createdAt: 1 });
    await old.table('xp').add({ id: 'x1', ts: 1, date: '2026-11-02', source: 'session', refId: 'session:s1', xp: 100, coins: 20, label: 'Focus' });
    old.close();

    const db = new LifeDB(name);
    await db.open();
    expect(db.verno).toBe(13);
    expect((await db.settings.get('workTargets'))!.value).toEqual({ weekday: { done: 5, full: 7 }, weekend: { done: 3, full: 5 }, teaching: { done: 4, full: 5 } });
    expect(await db.settings.get('playerName')).toMatchObject({ value: 'P' });
    expect(await db.sessions.get('s1')).toMatchObject({ minutes: 300 });
    expect(await db.areaHours.get('h1')).toMatchObject({ hours: 6, weekly: true });
    expect(await db.xp.get('session:s1')).toMatchObject({ xp: 100 });
    db.close();
  });

  it('keeps a teaching pair that is already there', () => {
    expect(migrateWorkTargetsV12({ weekday: { done: 6, full: 8 }, weekend: { done: 4, full: 6 }, teaching: { done: 3, full: 4 } }).teaching).toEqual({ done: 3, full: 4 });
  });
});

/** v12 → v13 (P2 sync): XP ids become their refId; totals, dates and labels don't change; nothing is queued to sync. */
describe('upgrade from v12 (sync groundwork)', () => {
  const V12 = {
    areas: 'id, order', tasks: 'id, areaId, status, dueDate, priority, completedAt', habits: 'id, &key, order',
    habitLogs: 'id, habitId, date, [habitId+date]', sessions: 'id, areaId, date, start', accounts: 'id, order',
    transactions: 'id, accountId, date, kind, areaId, transferId', goals: 'id, order', opportunities: 'id, status',
    rewards: 'id', xp: 'id, date, source, refId, ts', unlocked: 'key', settings: 'key',
    statements: 'id, accountId, cutoffDate, dueDate', installments: 'id, accountId, txId',
    pipelineEvents: 'id, date, kind, opportunityId', reviews: 'id', areaHours: 'id, areaId, date'
  };

  it('re-keys the ledger by refId and keeps every XP point and coin', async () => {
    const name = 'upgrade-v12-test';
    const old = new Dexie(name);
    old.version(12).stores(V12);
    await old.open();
    const rows = [
      { id: 'f3c1', ts: 10, date: '2026-11-02', source: 'habit', refId: 'habit:h1:2026-11-02', xp: 25, coins: 5, label: 'Exercise' },
      { id: '09ab', ts: 20, date: '2026-11-02', source: 'perfect-day', refId: 'perfect:2026-11-02', xp: 60, coins: 12, label: 'Perfect day' },
      { id: 'aa01', ts: 30, date: '2026-11-03', source: 'reward', refId: 'reward:r1:30', xp: 0, coins: -40, label: 'Redeemed' },
      // Two rows with one refId (an old double award): both survive, so the total doesn't change.
      { id: 'zz99', ts: 40, date: '2026-11-03', source: 'task', refId: 'task:k1', xp: 35, coins: 7, label: 'Quest' },
      { id: 'yy88', ts: 50, date: '2026-11-03', source: 'task', refId: 'task:k1', xp: 35, coins: 7, label: 'Quest' }
    ];
    await old.table('xp').bulkAdd(rows);
    await old.table('tasks').add({ id: 'k1', areaId: 'a', title: 'Grade', difficulty: 3, priority: 1, status: 'done', createdAt: 1, completedAt: 2 });
    old.close();

    const db = new LifeDB(name);
    await db.open();
    expect(db.verno).toBe(13);
    const after = await db.xp.toArray();
    expect(after).toHaveLength(5);
    expect(after.reduce((s, e) => s + e.xp, 0)).toBe(155);
    expect(after.reduce((s, e) => s + e.coins, 0)).toBe(-9); // 5 + 12 − 40 + 7 + 7
    expect(await db.xp.get('perfect:2026-11-02')).toMatchObject({ xp: 60, date: '2026-11-02', label: 'Perfect day', ts: 20 });
    expect(await db.xp.get('reward:r1:30')).toMatchObject({ coins: -40 });
    expect(await db.xp.get('task:k1')).toMatchObject({ ts: 40 });
    expect(await db.xp.get('task:k1#2')).toMatchObject({ ts: 50, refId: 'task:k1' });
    expect(await db.tasks.get('k1')).toMatchObject({ status: 'done' });
    // The upgrade runs on each device by itself: nothing is queued to sync.
    expect(await db.syncOutbox.count()).toBe(0);
    db.close();
  });

  it('rekeyXpV13 is stable when run twice (backups made after v13)', () => {
    const rows = [
      { id: 'a', ts: 1, refId: 'x' }, { id: 'b', ts: 2, refId: 'x' }, { id: 'c', ts: 3, refId: 'y' }
    ];
    const once = rekeyXpV13(rows);
    expect(once.map(r => r.id)).toEqual(['x', 'x#2', 'y']);
    expect(rekeyXpV13(once).map(r => r.id)).toEqual(['x', 'x#2', 'y']);
  });
});
