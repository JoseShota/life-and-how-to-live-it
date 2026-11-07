import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { monthTotals, netWorth, EXPENSE_CATEGORIES } from '../src/finance/finance';
import { redeem, undoRedeem, award, totals } from '../src/game/engine';
import type { Account, Transaction } from '../src/db/types';

const tx = (o: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36), accountId: 'd', date: '2026-11-03', amount: 0, kind: 'expense', category: 'Food', createdAt: 0, ...o });

describe('treasury math (V-8)', () => {
  it('savings rate is null without income, not a red 0 %', () => {
    expect(monthTotals([tx({ amount: -500 })], '2026-11').savingsRate).toBeNull();
  });
  it('refunds reduce spending instead of counting as income', () => {
    const m = monthTotals([tx({ amount: -1000 }), tx({ kind: 'income', amount: 300, category: 'Refund' }), tx({ kind: 'income', amount: 10000, category: 'Freelance' })], '2026-11');
    expect(m).toMatchObject({ income: 10000, expense: 700 });
    expect(m.savingsRate).toBeCloseTo(0.93);
  });
  it('card payments are not an expense category', () => {
    expect(EXPENSE_CATEGORIES).not.toContain('Card payment');
  });
  it('archived accounts still count toward net worth', () => {
    const a: Account = { id: 'a', name: 'Old savings', institution: 'x', type: 'savings', openingBalance: 5000, color: '#000', archived: true, order: 0 };
    expect(netWorth([a], [])).toBe(5000);
  });
});

describe('agora undo (V-8)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  it('a purchase can be undone and gives the coins back', async () => {
    await award('manual', 'test:coins', 500, 'test');
    const before = (await totals()).coins;
    const r = (await db.rewards.toArray()).sort((a, b) => a.cost - b.cost)[0];
    const ref = await redeem(r.id);
    expect(ref).toBeTruthy();
    expect((await totals()).coins).toBe(before - r.cost);
    await undoRedeem(ref!);
    expect((await totals()).coins).toBe(before);
  });
});
