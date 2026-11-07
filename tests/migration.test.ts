import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';
import { LifeDB } from '../src/db/db';

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
      { id: 'tax-m-2026-10', areaId: 'a', title: 'Declaración mensual RESICO · octubre 2026', difficulty: 2, priority: 2, dueDate: '2026-11-17', status: 'todo', createdAt: 1 },
      { id: 'k1', areaId: 'a', title: 'Grade midterms', difficulty: 3, priority: 1, status: 'done', createdAt: 1, completedAt: 2 }
    ]);
    old.close();

    const db = new LifeDB(name);
    await db.open();
    expect(db.verno).toBe(9);
    const habits = await db.habits.toArray();
    const by = (k: string) => habits.find(h => h.key === k)!;
    expect(by('wake').core).toBe(false);
    expect(by('intel')).toMatchObject({ core: false, intrinsic: true });
    expect(by('work')).toMatchObject({ core: true, name: 'Deep work', minLabel: '2 h of focus' });
    expect(by('eat')).toMatchObject({ core: false });
    expect(await db.settings.get('workTargets')).toMatchObject({ value: { weekday: { done: 6, full: 8 } } });
    expect(await db.accounts.get('c1')).toMatchObject({ bank: 'banorte', dueDaysAfterCutoff: 20, creditLimit: 30000 });
    expect((await db.accounts.get('d1'))!.role).toBe('operating');
    // Existing data is untouched: the ledger history and the transaction are still there.
    expect(await db.xp.get('x1')).toMatchObject({ xp: 100 });
    expect(await db.transactions.get('t1')).toMatchObject({ amount: -230 });
    expect(await db.statements.count()).toBe(0);
    expect(await db.pipelineEvents.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0); // v8
    // v9: the tax quest joins the monthly series; other quests are untouched.
    expect(await db.tasks.get('tax-m-2026-10')).toMatchObject({ recurrence: { every: 'month', series: 'tax-m', keepMissed: true }, dueDate: '2026-11-17' });
    expect(await db.tasks.get('k1')).toMatchObject({ title: 'Grade midterms', status: 'done', completedAt: 2 });
    expect((await db.tasks.get('k1'))!.recurrence).toBeUndefined();
    db.close();
  });
});
