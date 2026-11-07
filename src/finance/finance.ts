import type { Account, BankKey, Installment, Statement, Transaction, Session, Area, Opportunity } from '@/db/types';
import { dateKey, parseKey } from '@/lib/util';

export function balanceOf(acc: Account, txs: Transaction[]) {
  return acc.openingBalance + txs.filter(t => t.accountId === acc.id).reduce((s, t) => s + t.amount, 0);
}

/** Every account counts, archived ones too: archiving hides an account, it doesn't make its money disappear. */
export function netWorth(accounts: Account[], txs: Transaction[]) {
  return accounts.reduce((s, a) => s + balanceOf(a, txs), 0);
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

/** Income categories that give money back rather than earn it: they reduce spending instead of counting as income. */
export const REFUND_CATEGORIES = ['Refund'];

/**
 * Month totals on an accrual basis (card purchases count when made; card payments are transfers and don't).
 * `savingsRate` is null with no income: "0 %" would be a false alarm.
 */
export function monthTotals(txs: Transaction[], month = dateKey().slice(0, 7)) {
  const m = txs.filter(t => t.date.startsWith(month) && t.kind !== 'transfer');
  const isRefund = (t: Transaction) => t.kind === 'income' && REFUND_CATEGORIES.includes(t.category);
  const income = m.filter(t => t.kind === 'income' && !isRefund(t)).reduce((s, t) => s + t.amount, 0);
  const refunds = m.filter(isRefund).reduce((s, t) => s + t.amount, 0);
  const expense = Math.max(0, -m.filter(t => t.kind === 'expense').reduce((s, t) => s + t.amount, 0) - refunds);
  return { income, expense, net: income - expense, savingsRate: income > 0 ? (income - expense) / income : null };
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
  'Fun', 'Clothes', 'Gifts', 'Taxes', 'Other'
]; // Card payments are transfers ("Transfer / pay card"), never expenses: logging one as an expense would count it twice.
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Class', 'Royalties/Content', 'Interest', 'Refund', 'Other'];

export interface TransferInput {
  fromId: string;
  toId: string;
  /** Positive MXN; the sign is applied per leg. */
  amount: number;
  date: string;
  description?: string;
  /** True when `toId` is a credit card, so both legs read "Card payment". */
  isCardPayment: boolean;
  transferId: string;
  /** Leg ids [from, to]. Editing passes the existing ids so the `tx:<fromId>` XP refId stays valid. */
  ids: [string, string];
  createdAt: number;
}

/** The two legs of a transfer / card payment: −n out of `from`, +n into `to`, sharing `transferId`. */
export function transferLegs(i: TransferInput): [Transaction, Transaction] {
  const n = Math.abs(i.amount);
  const shared = { date: i.date, description: i.description, kind: 'transfer' as const, category: i.isCardPayment ? 'Card payment' : 'Transfer', transferId: i.transferId, createdAt: i.createdAt };
  return [
    { ...shared, id: i.ids[0], accountId: i.fromId, amount: -n },
    { ...shared, id: i.ids[1], accountId: i.toId, amount: n }
  ];
}

/** Splits a transfer's legs into [from, to] by sign (from is the negative leg). */
export function splitLegs(legs: Transaction[]): { from?: Transaction; to?: Transaction } {
  return { from: legs.find(t => t.amount < 0), to: legs.find(t => t.amount >= 0) };
}

// ---------- Credit cards: statements, due dates, MSI (v4) ----------

/** Bank presets. Add a bank here when you open a card with it; every card then follows the same statement model. */
export const BANKS: Record<BankKey, { name: string; dueDaysAfterCutoff?: number; note: string }> = {
  banorte: { name: 'Banorte', dueDaysAfterCutoff: 20, note: 'Payment is due 20 calendar days after the cut-off (Banorte card terms).' },
  other: { name: 'Other bank', note: 'Enter how many days after the cut-off your payment is due.' }
};

const addDays = (key: string, n: number) => { const d = parseKey(key); d.setDate(d.getDate() + n); return dateKey(d); };
const cents = (n: number) => Math.round(n * 100) / 100;

/** Days from the cut-off to the due date: the bank preset, the card's own value, or the legacy day-of-month pair. */
export function dueDaysFor(acc: Account) {
  if (acc.dueDaysAfterCutoff) return acc.dueDaysAfterCutoff;
  if (acc.bank && BANKS[acc.bank].dueDaysAfterCutoff) return BANKS[acc.bank].dueDaysAfterCutoff!;
  if (acc.cutoffDay && acc.paymentDueDay) return ((acc.paymentDueDay - acc.cutoffDay + 30) % 30) || 20;
  return 20;
}

/** The most recent cut-off on or before `today` (clamped to short months). */
export function lastCutoff(cutoffDay: number, today = dateKey()) {
  const t = parseKey(today);
  const make = (y: number, m: number) => new Date(y, m, Math.min(cutoffDay, new Date(y, m + 1, 0).getDate()));
  let d = make(t.getFullYear(), t.getMonth());
  if (d > t) d = make(t.getFullYear(), t.getMonth() - 1);
  return dateKey(d);
}

/** The first cut-off on or after `key`: the statement that will bill a purchase made on `key`. */
export function cutoffOnOrAfter(cutoffDay: number, key: string) {
  const last = lastCutoff(cutoffDay, key);
  if (last === key) return key;
  const d = parseKey(key);
  const make = (y: number, m: number) => new Date(y, m, Math.min(cutoffDay, new Date(y, m + 1, 0).getDate()));
  let n = make(d.getFullYear(), d.getMonth());
  if (n < d) n = make(d.getFullYear(), d.getMonth() + 1);
  return dateKey(n);
}

export const dueDateFor = (acc: Account, cutoffDate: string) => addDays(cutoffDate, dueDaysFor(acc));

/** Card balance at the end of day `key` (negative = owed). */
export function balanceAt(acc: Account, txs: Transaction[], key: string) {
  return acc.openingBalance + txs.filter(t => t.accountId === acc.id && t.date <= key).reduce((s, t) => s + t.amount, 0);
}

const monthsBetween = (a: string, b: string) => { const x = parseKey(a), y = parseKey(b); return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth(); };

/** Installments billed up to and including the statement cut on `cutoffDate`. */
export function installmentsBilled(i: Installment, cutoffDate: string) {
  if (cutoffDate < i.firstCutoff) return 0;
  return Math.min(i.months, monthsBetween(i.firstCutoff, cutoffDate) + 1);
}
export const installmentAmount = (i: Installment) => cents(i.total / i.months);
/** MSI still to be billed after the statement cut on `cutoffDate`. */
export const installmentRemaining = (i: Installment, cutoffDate: string) => cents(i.total - installmentAmount(i) * installmentsBilled(i, cutoffDate));

/**
 * Estimate of a statement from the ledger. The bank's number is the truth (the user types it in); this only prefills.
 * Pago para no generar intereses = everything owed at the cut-off minus MSI installments not billed yet.
 */
export function estimateStatement(acc: Account, txs: Transaction[], installments: Installment[], cutoffDate: string) {
  const owed = Math.max(0, -balanceAt(acc, txs, cutoffDate));
  // A plan whose first cut-off is later was bought after this cut-off, so it isn't owed on this statement.
  const msiFuture = installments.filter(i => i.accountId === acc.id && i.firstCutoff <= cutoffDate).reduce((s, i) => s + installmentRemaining(i, cutoffDate), 0);
  return { statementBalance: cents(owed), noInterestPayment: cents(Math.max(0, owed - msiFuture)), msiFuture: cents(msiFuture) };
}

/** Payments into the card after the cut-off and up to `until` (inclusive). Only transfers count; refunds don't. */
export function paidSince(acc: Account, txs: Transaction[], cutoffDate: string, until = '9999-12-31') {
  return cents(txs.filter(t => t.accountId === acc.id && t.kind === 'transfer' && t.amount > 0 && t.date > cutoffDate && t.date <= until).reduce((s, t) => s + t.amount, 0));
}

export type StatementState = 'paid' | 'due' | 'late' | 'nothing-due';
export interface StatementStatus { paid: number; paidOnTime: number; remaining: number; state: StatementState; daysToDue: number }

/** Status of a statement against the pago para no generar intereses. Half a peso of rounding counts as paid. */
export function statementStatus(acc: Account, txs: Transaction[], st: Statement, today = dateKey()): StatementStatus {
  const paid = paidSince(acc, txs, st.cutoffDate);
  const paidOnTime = paidSince(acc, txs, st.cutoffDate, st.dueDate);
  const remaining = cents(Math.max(0, st.noInterestPayment - paid));
  const daysToDue = Math.round((parseKey(st.dueDate).getTime() - parseKey(today).getTime()) / 864e5);
  let state: StatementState;
  if (st.noInterestPayment <= 0) state = 'nothing-due';
  else if (st.noInterestPayment - paidOnTime <= 0.5) state = 'paid';
  else if (today > st.dueDate) state = 'late';
  else state = 'due';
  return { paid, paidOnTime, remaining: state === 'paid' ? 0 : remaining, state, daysToDue };
}

/** Purchases (and other charges) posted after the cut-off: they go on the next statement. */
export function newSinceCutoff(acc: Account, txs: Transaction[], cutoffDate: string) {
  return cents(-txs.filter(t => t.accountId === acc.id && t.amount < 0 && t.date > cutoffDate).reduce((s, t) => s + t.amount, 0));
}

/** Statements paid in full on time, counted back from the most recent one that's settled (paid or late). */
export function totaleroStreak(accounts: Account[], txs: Transaction[], statements: Statement[], today = dateKey()) {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const settled = statements
    .filter(s => byId.has(s.accountId) && s.noInterestPayment > 0)
    .map(s => ({ s, st: statementStatus(byId.get(s.accountId)!, txs, s, today) }))
    .filter(x => x.st.state === 'paid' || x.st.state === 'late')
    .sort((a, b) => b.s.dueDate.localeCompare(a.s.dueDate));
  let n = 0;
  for (const x of settled) { if (x.st.state !== 'paid') break; n++; }
  return n;
}

export type CardAlert =
  | { kind: 'pay' | 'late'; account: Account; amount: number; dueDate: string; daysToDue: number }
  | { kind: 'enter-statement'; account: Account; cutoffDate: string; estimate: number };

/**
 * What Today should say about cards: pay the pago para no generar intereses when the due date is within
 * `withinDays` (or already passed), or enter the statement for a cut-off that has no statement yet.
 */
export function cardAlerts(accounts: Account[], txs: Transaction[], statements: Statement[], installments: Installment[], today = dateKey(), withinDays = 5): CardAlert[] {
  const out: CardAlert[] = [];
  for (const acc of accounts.filter(a => a.type === 'credit' && !a.archived)) {
    const st = statements.filter(s => s.accountId === acc.id).sort((a, b) => b.cutoffDate.localeCompare(a.cutoffDate))[0];
    if (st) {
      const s = statementStatus(acc, txs, st, today);
      if (s.state === 'late') out.push({ kind: 'late', account: acc, amount: s.remaining, dueDate: st.dueDate, daysToDue: s.daysToDue });
      else if (s.state === 'due' && s.daysToDue <= withinDays) out.push({ kind: 'pay', account: acc, amount: s.remaining, dueDate: st.dueDate, daysToDue: s.daysToDue });
    }
    if (acc.cutoffDay) {
      const cut = lastCutoff(acc.cutoffDay, today);
      const est = estimateStatement(acc, txs, installments, cut);
      if ((!st || st.cutoffDate < cut) && est.statementBalance > 0) out.push({ kind: 'enter-statement', account: acc, cutoffDate: cut, estimate: est.noInterestPayment });
    }
  }
  return out;
}
