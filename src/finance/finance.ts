import type { Account, Transaction, Session, Area, Opportunity } from '@/db/types';
import { dateKey } from '@/lib/util';

export function balanceOf(acc: Account, txs: Transaction[]) {
  return acc.openingBalance + txs.filter(t => t.accountId === acc.id).reduce((s, t) => s + t.amount, 0);
}

export function netWorth(accounts: Account[], txs: Transaction[]) {
  return accounts.filter(a => !a.archived).reduce((s, a) => s + balanceOf(a, txs), 0);
}

/** Next occurrence of a day-of-month on/after `from` (clamps to month length). */
export function nextDayOfMonth(day: number, from = new Date()) {
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const make = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  let d = make(f.getFullYear(), f.getMonth());
  if (d < f) d = make(f.getFullYear(), f.getMonth() + 1);
  return d;
}

export const daysUntil = (d: Date, from = new Date()) =>
  Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) / 864e5);

export interface CardStatus {
  account: Account;
  balance: number;
  debt: number;
  available: number;
  utilization: number;
  nextCutoff?: Date;
  nextDue?: Date;
  daysToDue?: number;
}

export function cardStatus(acc: Account, txs: Transaction[], now = new Date()): CardStatus {
  const balance = balanceOf(acc, txs);
  const debt = Math.max(0, -balance);
  const limit = acc.creditLimit ?? 0;
  const nextDue = acc.paymentDueDay ? nextDayOfMonth(acc.paymentDueDay, now) : undefined;
  return {
    account: acc,
    balance,
    debt,
    available: limit - debt,
    utilization: limit > 0 ? debt / limit : 0,
    nextCutoff: acc.cutoffDay ? nextDayOfMonth(acc.cutoffDay, now) : undefined,
    nextDue,
    daysToDue: nextDue ? daysUntil(nextDue, now) : undefined
  };
}

export function monthTotals(txs: Transaction[], month = dateKey().slice(0, 7)) {
  const m = txs.filter(t => t.date.startsWith(month) && t.kind !== 'transfer');
  const income = m.filter(t => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = 0 - m.filter(t => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense: expense + 0, net: income - expense, savingsRate: income > 0 ? (income - expense) / income : 0 };
}

export function expenseByCategory(txs: Transaction[], month = dateKey().slice(0, 7)) {
  const map = new Map<string, number>();
  txs.filter(t => t.kind === 'expense' && t.date.startsWith(month)).forEach(t => map.set(t.category, (map.get(t.category) ?? 0) - t.amount));
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/**
 * The "wealth engine": for each monetizable activity, how much it paid and how many hours it consumed
 * in the window -> effective hourly rate. This tells you where your next hour is worth the most.
 */
export function hourlyRates(areas: Area[], txs: Transaction[], sessions: Session[], sinceKey: string) {
  return areas.filter(a => !a.archived).map(a => {
    const income = txs.filter(t => t.kind === 'income' && t.areaId === a.id && t.date >= sinceKey).reduce((s, t) => s + t.amount, 0);
    const minutes = sessions.filter(s => s.areaId === a.id && s.date >= sinceKey).reduce((s, x) => s + x.minutes, 0);
    const hours = minutes / 60;
    return { area: a, income, hours, rate: hours > 0 ? income / hours : 0 };
  }).sort((x, y) => y.rate - x.rate || y.income - x.income);
}

export function pipelineValue(opps: Opportunity[]) {
  const open = opps.filter(o => o.status !== 'lost' && o.status !== 'won');
  return {
    expectedMonthly: open.reduce((s, o) => s + o.monthlyValue * o.probability, 0),
    bestCaseMonthly: open.reduce((s, o) => s + o.monthlyValue, 0),
    wonMonthly: opps.filter(o => o.status === 'won').reduce((s, o) => s + o.monthlyValue, 0)
  };
}

export const EXPENSE_CATEGORIES = [
  'Rent', 'Food', 'Transport', 'Services', 'Subscriptions', 'Health', 'Gym', 'Education', 'Tools/Software',
  'Fun', 'Clothes', 'Gifts', 'Card payment', 'Taxes', 'Other'
];
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Class', 'Royalties/Content', 'Interest', 'Refund', 'Other'];
