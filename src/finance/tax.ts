// PURE Mexican tax estimates for personas físicas in RESICO (LISR art. 113-E, 113-J; LIVA). No I/O.
// These are estimates to plan cash; the SAT declaration is the source of truth.
import type { IncomeTax, Transaction } from '@/db/types';
import { dateKey, parseKey } from '@/lib/util';

/** Monthly RESICO table (art. 113-E): one flat rate on the whole month's collected income, not marginal. */
export const RESICO_MONTHLY: [number, number][] = [
  [25_000, 0.01], [50_000, 0.011], [83_333.33, 0.015], [208_333.33, 0.02], [3_500_000, 0.025]
];
export const RESICO_ANNUAL_CAP = 3_500_000;
export const RESICO_ISR_WITHHOLDING = 0.0125; // art. 113-J, when a persona moral pays you
export const IVA_RATE = 0.16;
export const IVA_WITHHOLDING_SHARE = 2 / 3;   // services billed to a persona moral
export const MONTHLY_DUE_DAY = 17;             // of the following month

export interface TaxProfile {
  regime: 'resico' | 'none';
  /** Do you charge IVA on your invoices? */
  chargesIva: boolean;
  /** Count salary toward the 3.5 M cap (sources disagree; you decide as your own contador) */
  capIncludesSalary: boolean;
}
export const DEFAULT_TAX_PROFILE: TaxProfile = { regime: 'resico', chargesIva: true, capIncludesSalary: true };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resicoRate(monthIncome: number) {
  if (monthIncome <= 0) return RESICO_MONTHLY[0][1];
  for (const [limit, rate] of RESICO_MONTHLY) if (monthIncome <= limit) return rate;
  return RESICO_MONTHLY[RESICO_MONTHLY.length - 1][1];
}

/** Invoice breakdown from the subtotal: IVA charged, withholdings, and what will land in the account. */
export function invoiceFromSubtotal(subtotal: number, chargesIva: boolean, clientIsCompany: boolean): IncomeTax & { deposit: number } {
  const ivaCharged = chargesIva ? r2(subtotal * IVA_RATE) : 0;
  const isrWithheld = clientIsCompany ? r2(subtotal * RESICO_ISR_WITHHOLDING) : 0;
  const ivaWithheld = clientIsCompany && chargesIva ? r2(ivaCharged * IVA_WITHHOLDING_SHARE) : 0;
  return { kind: 'resico', subtotal: r2(subtotal), ivaCharged, isrWithheld, ivaWithheld, clientIsCompany, deposit: r2(subtotal + ivaCharged - isrWithheld - ivaWithheld) };
}

/** The 17th of the month after `month` (YYYY-MM). */
export function monthlyDueDate(month: string) {
  const [y, m] = month.split('-').map(Number);
  return dateKey(new Date(y, m, MONTHLY_DUE_DAY));
}

export interface MonthTax {
  month: string;
  base: number; rate: number; isr: number; isrWithheld: number; isrDue: number; isrExcess: number;
  ivaCharged: number; ivaWithheld: number; ivaCreditable: number; ivaDue: number; ivaInFavor: number;
  totalDue: number; dueDate: string; invoices: number;
}

/** Estimate of a month's RESICO declaration, on a cash basis (income dated when it was collected). */
export function monthTax(txs: Transaction[], month: string): MonthTax {
  const inc = txs.filter(t => t.kind === 'income' && t.date.startsWith(month) && t.incomeTax?.kind === 'resico');
  const base = r2(inc.reduce((s, t) => s + t.incomeTax!.subtotal, 0));
  const rate = resicoRate(base);
  const isr = r2(base * rate);
  const isrWithheld = r2(inc.reduce((s, t) => s + t.incomeTax!.isrWithheld, 0));
  const ivaCharged = r2(inc.reduce((s, t) => s + t.incomeTax!.ivaCharged, 0));
  const ivaWithheld = r2(inc.reduce((s, t) => s + t.incomeTax!.ivaWithheld, 0));
  const ivaCreditable = r2(txs.filter(t => t.kind === 'expense' && t.date.startsWith(month)).reduce((s, t) => s + (t.ivaCreditable ?? 0), 0));
  const ivaNet = r2(ivaCharged - ivaWithheld - ivaCreditable);
  const isrDue = Math.max(0, r2(isr - isrWithheld));
  const ivaDue = Math.max(0, ivaNet);
  return {
    month, base, rate, isr, isrWithheld, isrDue, isrExcess: Math.max(0, r2(isrWithheld - isr)),
    ivaCharged, ivaWithheld, ivaCreditable, ivaDue, ivaInFavor: Math.max(0, -ivaNet),
    totalDue: r2(isrDue + ivaDue), dueDate: monthlyDueDate(month), invoices: inc.length
  };
}

/**
 * Tax to set aside from one income, right when it lands: ISR at the rate the month reaches with it, minus what
 * the client withheld, plus the IVA you'll have to pay over. Salary and untaxed income need no reserve.
 */
export function reserveFor(tx: Transaction, monthBaseBefore: number) {
  const t = tx.incomeTax;
  if (!t || t.kind !== 'resico') return 0;
  const rate = resicoRate(monthBaseBefore + t.subtotal);
  // Monthly ISR never goes below zero (excess withholding is credited in the annual return), so it can't offset IVA.
  return r2(Math.max(0, t.subtotal * rate - t.isrWithheld) + Math.max(0, t.ivaCharged - t.ivaWithheld));
}

/** Income counted toward the RESICO 3.5 M cap this year. */
export function yearToDate(txs: Transaction[], year: number, includeSalary: boolean) {
  const y = String(year);
  const counted = txs.filter(t => t.kind === 'income' && t.date.startsWith(y) && (t.incomeTax?.kind === 'resico' || (includeSalary && t.incomeTax?.kind === 'salary')));
  const total = r2(counted.reduce((s, t) => s + t.incomeTax!.subtotal, 0));
  return { total, share: total / RESICO_ANNUAL_CAP, left: Math.max(0, r2(RESICO_ANNUAL_CAP - total)) };
}

/** Months whose declaration is still ahead of us on `today` (this month, and last month until the 17th). */
export function openMonths(today = dateKey()) {
  const t = parseKey(today);
  const cur = dateKey(t).slice(0, 7);
  const prev = dateKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7);
  return today <= monthlyDueDate(prev) ? [prev, cur] : [cur];
}

// ---------- Split it (pay yourself first) ----------
export interface SplitPlan { savingsPct: number; skillsPct: number; funPct: number }
export const DEFAULT_SPLIT: SplitPlan = { savingsPct: 10, skillsPct: 10, funPct: 5 };
export const SMART_STEP = 2;      // Save More Tomorrow: +2 points when income beats its recent median
export const SMART_MAX = 40;

export interface SplitRow { role: 'tax' | 'shield' | 'invest' | 'skills' | 'fun' | 'operating'; amount: number }

/** How one deposit should be split: tax reserve first, then savings (shield vs invest by level), skills, fun; the rest operates. */
export function splitIncome(deposit: number, taxReserve: number, plan: SplitPlan, investShare: number): SplitRow[] {
  const tax = Math.min(deposit, r2(taxReserve));
  const after = Math.max(0, deposit - tax);
  const savings = r2(after * plan.savingsPct / 100);
  const invest = r2(savings * investShare);
  const rows: SplitRow[] = [
    { role: 'tax', amount: tax },
    { role: 'shield', amount: r2(savings - invest) },
    { role: 'invest', amount: invest },
    { role: 'skills', amount: r2(after * plan.skillsPct / 100) },
    { role: 'fun', amount: r2(after * plan.funPct / 100) }
  ];
  const used = rows.reduce((s, r) => s + r.amount, 0);
  rows.push({ role: 'operating', amount: r2(deposit - used) });
  return rows.filter(r => r.amount > 0);
}

/** Suggest a SMarT step when this month's income beats the median of the previous 3 months. */
export function smartSuggestion(monthIncome: number, prevMonthIncomes: number[], plan: SplitPlan) {
  const prev = prevMonthIncomes.filter(x => x > 0).sort((a, b) => a - b);
  if (prev.length < 2 || plan.savingsPct >= SMART_MAX) return null;
  const mid = Math.floor(prev.length / 2);
  const median = prev.length % 2 ? prev[mid] : (prev[mid - 1] + prev[mid]) / 2;
  return monthIncome > median ? { from: plan.savingsPct, to: Math.min(SMART_MAX, plan.savingsPct + SMART_STEP), median } : null;
}
