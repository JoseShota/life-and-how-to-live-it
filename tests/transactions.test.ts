import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { award, deleteTransaction, editTransaction, rewardTransactionLogged, totals } from '../src/game/engine';
import { splitLegs, transferLegs } from '../src/finance/finance';
import { FINANCE_XP } from '../src/game/rules';
import { uid } from '../src/lib/util';

const base = { date: '2026-11-06', createdAt: 1, transferId: 'T', ids: ['a', 'b'] as [string, string] };

describe('transferLegs (pure)', () => {
  it('builds −n / +n legs sharing transferId, whatever sign the amount comes in', () => {
    const [from, to] = transferLegs({ ...base, fromId: 'debit', toId: 'card', amount: -1500, isCardPayment: true });
    expect(from).toMatchObject({ id: 'a', accountId: 'debit', amount: -1500, kind: 'transfer', category: 'Card payment', transferId: 'T' });
    expect(to).toMatchObject({ id: 'b', accountId: 'card', amount: 1500, kind: 'transfer', category: 'Card payment', transferId: 'T' });
  });
  it('labels a plain transfer and splits legs by sign', () => {
    const legs = transferLegs({ ...base, fromId: 'x', toId: 'y', amount: 200, isCardPayment: false });
    expect(legs[0].category).toBe('Transfer');
    const { from, to } = splitLegs([legs[1], legs[0]]);
    expect(from?.id).toBe('a'); expect(to?.id).toBe('b');
  });
});

describe('transactions (db)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });

  async function makeTransfer() {
    const [a, b, c] = await db.accounts.orderBy('order').toArray();
    const ids: [string, string] = [uid(), uid()];
    await db.transactions.bulkAdd(transferLegs({ fromId: a.id, toId: b.id, amount: 1000, date: '2026-11-06', isCardPayment: false, transferId: uid(), ids, createdAt: 1 }));
    await award('finance', `tx:${ids[0]}`, FINANCE_XP.payCardInFull, 'test');
    return { a, b, c, ids };
  }

  it('deleting a transfer from its second leg removes both legs and the XP on the first leg', async () => {
    const { ids } = await makeTransfer();
    const second = (await db.transactions.get(ids[1]))!;
    await deleteTransaction(second);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.xp.where('refId').equals(`tx:${ids[0]}`).count()).toBe(0);
  });

  it('deleting a plain transaction revokes its XP', async () => {
    const [acc] = await db.accounts.toArray();
    const id = uid();
    await db.transactions.add({ id, accountId: acc.id, date: '2026-11-06', amount: -50, kind: 'expense', category: 'Food', createdAt: 1 });
    await rewardTransactionLogged(id);
    await deleteTransaction((await db.transactions.get(id))!);
    expect(await db.xp.count()).toBe(0);
  });

  it('editing a transfer from either leg updates both legs and never changes XP', async () => {
    const { a, b, c, ids } = await makeTransfer();
    const before = await totals();
    const second = (await db.transactions.get(ids[1]))!;
    await editTransaction(second, { amount: 2500, date: '2026-11-01', description: 'rent', accountId: c.id, toAccountId: a.id });
    const legs = await db.transactions.where('transferId').equals(second.transferId!).toArray();
    expect(legs).toHaveLength(2);
    const from = legs.find(t => t.id === ids[0])!; const to = legs.find(t => t.id === ids[1])!;
    expect(from).toMatchObject({ accountId: c.id, amount: -2500, date: '2026-11-01', description: 'rent', createdAt: 1 });
    expect(to).toMatchObject({ accountId: a.id, amount: 2500, date: '2026-11-01', description: 'rent' });
    expect(b.id).not.toBe(to.accountId);
    expect(await totals()).toEqual(before);
    expect(await db.xp.where('refId').equals(`tx:${ids[0]}`).count()).toBe(1);
  });

  it('editing an expense keeps it negative and keeps its XP', async () => {
    const [acc] = await db.accounts.toArray();
    const id = uid();
    await db.transactions.add({ id, accountId: acc.id, date: '2026-11-06', amount: -50, kind: 'expense', category: 'Food', createdAt: 1 });
    await rewardTransactionLogged(id);
    const before = await totals();
    await editTransaction((await db.transactions.get(id))!, { amount: 80, date: '2026-11-05', accountId: acc.id, category: 'Transport' });
    expect(await db.transactions.get(id)).toMatchObject({ amount: -80, kind: 'expense', category: 'Transport', date: '2026-11-05' });
    expect(await totals()).toEqual(before);
  });
});
