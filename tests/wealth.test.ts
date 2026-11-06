import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, migrateAccountV5 } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { checkAchievements, wealthLevelReached } from '../src/game/achievements';
import { monthlySpending, investShare, wealthSnapshot, levelsToAward } from '../src/finance/wealth';
import { transferLegs } from '../src/finance/finance';
import type { Account, Transaction } from '../src/db/types';
import { uid } from '../src/lib/util';

const acc = (o: Partial<Account>): Account => ({ id: uid(), name: 'x', institution: 'Banorte', type: 'debit', openingBalance: 0, color: '#000', archived: false, order: 0, ...o });
const exp = (accountId: string, date: string, amount: number): Transaction => ({ id: uid(), accountId, date, amount: -amount, kind: 'expense', category: 'Food', createdAt: 0 });

describe('wealth levels (pure)', () => {
  it('monthly spending is the median of the last 3 full months with expenses', () => {
    const d = acc({ id: 'd' });
    const txs = [exp('d', '2026-07-31', 1), exp('d', '2026-08-10', 20000), exp('d', '2026-09-10', 30000), exp('d', '2026-10-10', 25000), exp('d', '2026-11-02', 99999)];
    expect(monthlySpending(txs, '2026-11-06')).toEqual({ median: 25000, months: 3 });
    expect(monthlySpending([], '2026-11-06').median).toBeNull();
    // Logging started mid-October: October is not a full month yet.
    expect(monthlySpending([exp('d', '2026-10-15', 300)], '2026-11-06').median).toBeNull();
  });
  it('investing share follows the level reached and today\'s shield', () => {
    expect(investShare(2, 5)).toBe(0);
    expect(investShare(3, 3)).toBe(0.25);
    expect(investShare(3, 2)).toBe(0); // below the line: refill first
    expect(investShare(4, 6)).toBe(1);
    expect(investShare(4, 4)).toBe(0.25);
  });
  it('shield months use the spending estimate until there is a full month of data', () => {
    const shield = acc({ type: 'savings', role: 'shield', openingBalance: 75000 });
    const s = wealthSnapshot({ accounts: [shield], txs: [], statements: [], spendingEstimate: 25000, today: '2026-11-06' });
    expect(s.shieldMonths).toBe(3);
    expect(s.qualifies(3)).toBe(true);
    expect(s.qualifies(4)).toBe(false);
  });
  it('levels are awarded in order and need the previous one', () => {
    const q = (n: number) => n !== 2;
    expect(levelsToAward(0, q)).toEqual([1]);
    expect(levelsToAward(0, () => true)).toEqual([1, 2, 3, 4, 5]);
  });
  it('v5 migration sets bucket roles by account type', () => {
    const a = { type: 'savings' } as { type: string; role?: string };
    migrateAccountV5(a);
    expect(a.role).toBe('shield');
  });
});

describe('wealth levels (db)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  it('fresh installs get the bucket accounts', async () => {
    const roles = (await db.accounts.toArray()).map(a => a.role);
    expect(roles).toEqual(expect.arrayContaining(['operating', 'tax', 'shield', 'invest']));
  });
  it('level 2 is a permanent milestone: spending the shield later never takes it back', async () => {
    const accounts = await db.accounts.toArray();
    const debit = accounts.find(a => a.role === 'operating' && a.type === 'debit')!;
    const shield = accounts.find(a => a.role === 'shield')!;
    // Level 1: cards set up, 20 days of logs, a statement paid on time.
    for (const c of accounts.filter(a => a.type === 'credit')) await db.accounts.update(c.id, { creditLimit: 20000, cutoffDay: 1 });
    const card = accounts.find(a => a.type === 'credit')!;
    const today = new Date();
    const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < 20; i++) { const d = new Date(today); d.setDate(d.getDate() - i); await db.transactions.add(exp(debit.id, keyOf(d), 10)); }
    const cut = new Date(today); cut.setDate(cut.getDate() - 25);
    const due = new Date(cut); due.setDate(due.getDate() + 20);
    const paid = new Date(cut); paid.setDate(paid.getDate() + 5);
    await db.transactions.add({ ...exp(card.id, keyOf(new Date(cut.getTime() - 864e5)), 1000) });
    await db.statements.add({ id: 's', accountId: card.id, cutoffDate: keyOf(cut), dueDate: keyOf(due), statementBalance: 1000, noInterestPayment: 1000, minimumPayment: 100, createdAt: 0 });
    await db.transactions.bulkAdd(transferLegs({ fromId: debit.id, toId: card.id, amount: 1000, date: keyOf(paid), isCardPayment: true, transferId: uid(), ids: [uid(), uid()], createdAt: 0 }));
    // Shield: one month of spending (estimate, since there's no full month of data in this test).
    await db.settings.put({ key: 'spendingEstimate', value: 20000 });
    const leg = transferLegs({ fromId: debit.id, toId: shield.id, amount: 20000, date: keyOf(today), isCardPayment: false, transferId: uid(), ids: [uid(), uid()], createdAt: 0 });
    await db.transactions.bulkAdd(leg);
    await checkAchievements();
    expect(await wealthLevelReached()).toBe(2);
    await db.transactions.bulkDelete(leg.map(t => t.id));
    await checkAchievements();
    expect(await wealthLevelReached()).toBe(2);
    expect(await db.xp.where('refId').equals('wl:2').count()).toBe(1);
  });
});
