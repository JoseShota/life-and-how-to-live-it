import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, migrateAccountV4 } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { evaluateStatements, saveStatement, deleteTransaction, setInstallments } from '../src/game/engine';
import {
  lastCutoff, cutoffOnOrAfter, dueDateFor, installmentsBilled, installmentRemaining, estimateStatement, statementStatus,
  transferLegs, cardAlerts, totaleroStreak, newSinceCutoff
} from '../src/finance/finance';
import type { Account, Installment, Statement, Transaction } from '../src/db/types';
import { FINANCE_XP } from '../src/game/rules';
import { uid } from '../src/lib/util';

const card: Account = { id: 'c', name: 'Banorte Crédito 1', institution: 'Banorte', type: 'credit', bank: 'banorte', dueDaysAfterCutoff: 20, creditLimit: 30000, cutoffDay: 1, openingBalance: 0, color: '#000', archived: false, order: 0 };
const exp = (date: string, amount: number, id = uid()): Transaction => ({ id, accountId: 'c', date, amount: -amount, kind: 'expense', category: 'Food', createdAt: 0 });
const pay = (date: string, amount: number): Transaction => ({ id: uid(), accountId: 'c', date, amount, kind: 'transfer', category: 'Card payment', transferId: uid(), createdAt: 0 });
const stmt = (o: Partial<Statement> = {}): Statement => ({ id: 's1', accountId: 'c', cutoffDate: '2026-11-01', dueDate: '2026-11-21', statementBalance: 8000, noInterestPayment: 8000, minimumPayment: 600, createdAt: 0, ...o });

describe('card math (pure)', () => {
  it('cut-off dates clamp to short months and roll back', () => {
    expect(lastCutoff(1, '2026-11-06')).toBe('2026-11-01');
    expect(lastCutoff(10, '2026-11-06')).toBe('2026-10-10');
    expect(lastCutoff(31, '2026-03-05')).toBe('2026-02-28');
    expect(cutoffOnOrAfter(10, '2026-11-06')).toBe('2026-11-10');
    expect(cutoffOnOrAfter(10, '2026-11-10')).toBe('2026-11-10');
    expect(cutoffOnOrAfter(10, '2026-11-11')).toBe('2026-12-10');
  });
  it('Banorte: due 20 days after the cut-off', () => {
    expect(dueDateFor(card, '2026-11-01')).toBe('2026-11-21');
    expect(dueDateFor(card, '2026-12-20')).toBe('2027-01-09');
  });
  it('MSI bills total / months from the first cut-off', () => {
    const i: Installment = { id: 'i', accountId: 'c', description: 'laptop', total: 12000, months: 6, firstCutoff: '2026-11-01', createdAt: 0 };
    expect(installmentsBilled(i, '2026-10-01')).toBe(0);
    expect(installmentsBilled(i, '2026-11-01')).toBe(1);
    expect(installmentsBilled(i, '2027-06-01')).toBe(6);
    expect(installmentRemaining(i, '2026-11-01')).toBe(10000);
  });
  it('estimate leaves out MSI not billed yet', () => {
    const i: Installment = { id: 'i', accountId: 'c', description: 'laptop', total: 12000, months: 6, firstCutoff: '2026-11-01', createdAt: 0 };
    const e = estimateStatement(card, [exp('2026-10-20', 12000), exp('2026-10-25', 3000)], [i], '2026-11-01');
    expect(e).toEqual({ statementBalance: 15000, noInterestPayment: 5000, msiFuture: 10000 });
  });
  it('statement status: paid on time, due, late; purchases after the cut-off are new', () => {
    const txs = [exp('2026-10-20', 8000), pay('2026-11-15', 8000), exp('2026-11-03', 500)];
    expect(statementStatus(card, txs, stmt(), '2026-11-16').state).toBe('paid');
    expect(statementStatus(card, [exp('2026-10-20', 8000)], stmt(), '2026-11-16')).toMatchObject({ state: 'due', remaining: 8000, daysToDue: 5 });
    expect(statementStatus(card, [exp('2026-10-20', 8000), pay('2026-11-25', 8000)], stmt(), '2026-11-26').state).toBe('late');
    expect(newSinceCutoff(card, txs, '2026-11-01')).toBe(500);
  });
  it('alerts: pay within 5 days, or enter a missing statement', () => {
    const txs = [exp('2026-10-20', 8000)];
    expect(cardAlerts([card], txs, [stmt()], [], '2026-11-17')[0]).toMatchObject({ kind: 'pay', amount: 8000, daysToDue: 4 });
    expect(cardAlerts([card], txs, [], [], '2026-11-03')[0]).toMatchObject({ kind: 'enter-statement', cutoffDate: '2026-11-01', estimate: 8000 });
  });
  it('totalero streak counts settled statements from the most recent', () => {
    const s2 = stmt({ id: 's2', cutoffDate: '2026-12-01', dueDate: '2026-12-21' });
    const txs = [exp('2026-10-20', 8000), pay('2026-11-10', 8000), exp('2026-11-20', 8000), pay('2026-12-10', 8000)];
    expect(totaleroStreak([card], txs, [stmt(), s2], '2026-12-22')).toBe(2);
  });
  it('v4 migration gives Banorte cards the 20-day preset', () => {
    const a = { type: 'credit', institution: 'Banorte', cutoffDay: 20, paymentDueDay: 10 } as Parameters<typeof migrateAccountV4>[0];
    migrateAccountV4(a);
    expect(a).toMatchObject({ bank: 'banorte', dueDaysAfterCutoff: 20 });
  });
});

describe('card statements (db)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  const accounts = async () => {
    const all = await db.accounts.orderBy('order').toArray();
    return { debit: all.find(a => a.type === 'debit')!, card: all.find(a => a.type === 'credit')! };
  };
  const payCard = async (fromId: string, toId: string, amount: number, date: string) => {
    const ids: [string, string] = [uid(), uid()];
    await db.transactions.bulkAdd(transferLegs({ fromId, toId, amount, date, isCardPayment: true, transferId: uid(), ids, createdAt: 1 }));
    await evaluateStatements(toId);
    return ids;
  };

  it('a 1 MXN payment to a card with no statement earns nothing', async () => {
    const { debit, card } = await accounts();
    await payCard(debit.id, card.id, 1, '2026-11-06');
    expect(await db.xp.where('refId').startsWith('stmt:').count()).toBe(0);
  });

  it('paying the pago para no generar intereses by the due date pays +50 once; deleting the payment takes it back', async () => {
    const { debit, card } = await accounts();
    await db.transactions.add({ id: uid(), accountId: card.id, date: '2026-10-20', amount: -8000, kind: 'expense', category: 'Food', createdAt: 1 });
    await saveStatement(stmt({ accountId: card.id }));
    const ids = await payCard(debit.id, card.id, 5000, '2026-11-10');
    expect(await db.xp.where('refId').equals('stmt:s1').count()).toBe(0);
    await payCard(debit.id, card.id, 3000, '2026-11-12');
    const rows = await db.xp.where('refId').equals('stmt:s1').toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].xp).toBe(FINANCE_XP.payCardInFull);
    await deleteTransaction((await db.transactions.get(ids[0]))!);
    expect(await db.xp.where('refId').equals('stmt:s1').count()).toBe(0);
  });

  it('marking a card purchase as MSI creates a plan from the purchase cut-off', async () => {
    const { card } = await accounts();
    const id = uid();
    await db.transactions.add({ id, accountId: card.id, date: '2026-11-06', amount: -6000, kind: 'expense', category: 'Tools/Software', createdAt: 1 });
    await setInstallments((await db.transactions.get(id))!, 6);
    const plan = (await db.installments.toArray())[0];
    expect(plan).toMatchObject({ total: 6000, months: 6, txId: id });
    expect(plan.firstCutoff > '2026-11-06').toBe(true);
    expect((await db.transactions.get(id))!.installmentId).toBe(plan.id);
    await deleteTransaction((await db.transactions.get(id))!);
    expect(await db.installments.count()).toBe(0);
  });
});
