import { describe, it, expect } from 'vitest';
import {
  resicoRate, invoiceFromSubtotal, monthTax, monthlyDueDate, reserveFor, yearToDate, openMonths, splitIncome, smartSuggestion, DEFAULT_SPLIT
} from '../src/finance/tax';
import type { Transaction } from '../src/db/types';

let n = 0;
const income = (date: string, subtotal: number, company: boolean, iva = true): Transaction => {
  const inv = invoiceFromSubtotal(subtotal, iva, company);
  const { deposit, ...incomeTax } = inv;
  return { id: `i${n++}`, accountId: 'd', date, amount: deposit, kind: 'income', category: 'Freelance', incomeTax, createdAt: 0 };
};

describe('RESICO (pure)', () => {
  it('flat rate on the whole month by bracket (art. 113-E)', () => {
    expect(resicoRate(25_000)).toBe(0.01);
    expect(resicoRate(25_000.01)).toBe(0.011);
    expect(resicoRate(60_000)).toBe(0.015);
    expect(resicoRate(100_000)).toBe(0.02);
    expect(resicoRate(300_000)).toBe(0.025);
  });
  it('invoice to a company: 16 % IVA, 1.25 % ISR and two thirds of the IVA withheld', () => {
    const i = invoiceFromSubtotal(10_000, true, true);
    expect(i).toMatchObject({ ivaCharged: 1600, isrWithheld: 125, ivaWithheld: 1066.67, deposit: 10408.33 });
    expect(invoiceFromSubtotal(10_000, true, false)).toMatchObject({ isrWithheld: 0, ivaWithheld: 0, deposit: 11600 });
  });
  it('monthly estimate: ISR minus withholdings, IVA net of withheld and creditable, due the 17th', () => {
    const exp: Transaction = { id: 'e', accountId: 'd', date: '2026-10-12', amount: -1160, kind: 'expense', category: 'Tools/Software', ivaCreditable: 160, createdAt: 0 };
    const m = monthTax([income('2026-10-05', 40_000, true), income('2026-10-20', 20_000, false), exp], '2026-10');
    expect(m.base).toBe(60_000);
    expect(m.rate).toBe(0.015);
    expect(m.isr).toBe(900);
    expect(m.isrWithheld).toBe(500);
    expect(m.isrDue).toBe(400);
    expect(m.ivaCharged).toBe(9600);
    expect(m.ivaWithheld).toBe(4266.67);
    expect(m.ivaDue).toBe(9600 - 4266.67 - 160);
    expect(m.dueDate).toBe('2026-11-17');
    expect(monthlyDueDate('2026-12')).toBe('2027-01-17');
  });
  it('withheld ISR above the month ISR is reported as excess, not negative', () => {
    const m = monthTax([income('2026-10-05', 10_000, true)], '2026-10');
    expect(m.isr).toBe(100);
    expect(m.isrDue).toBe(0);
    expect(m.isrExcess).toBe(25);
  });
  it('reserve for one income uses the bracket the month reaches with it', () => {
    const t = income('2026-10-20', 20_000, false);
    expect(reserveFor(t, 0)).toBe(20_000 * 0.01 + 3200);
    expect(reserveFor(t, 40_000)).toBe(20_000 * 0.015 + 3200);
    // Excess ISR withholding never offsets the IVA owed.
    expect(reserveFor(income('2026-11-01', 40_000, true), 0)).toBe(6400 - 4266.67);
  });
  it('year to date toward the 3.5 M cap, salary optional', () => {
    const sal: Transaction = { id: 's', accountId: 'd', date: '2026-03-15', amount: 18000, kind: 'income', category: 'Salary', incomeTax: { kind: 'salary', subtotal: 20000, ivaCharged: 0, isrWithheld: 2000, ivaWithheld: 0, clientIsCompany: true }, createdAt: 0 };
    const txs = [income('2026-02-01', 50_000, false), sal];
    expect(yearToDate(txs, 2026, true).total).toBe(70_000);
    expect(yearToDate(txs, 2026, false).total).toBe(50_000);
  });
  it('last month stays open until its 17th', () => {
    expect(openMonths('2026-11-06')).toEqual(['2026-10', '2026-11']);
    expect(openMonths('2026-11-18')).toEqual(['2026-11']);
  });
});

describe('split it (pure)', () => {
  it('tax first, then savings split by the invest share, skills, fun; the rest operates', () => {
    const rows = splitIncome(10_000, 2_000, DEFAULT_SPLIT, 0.25);
    const by = Object.fromEntries(rows.map(r => [r.role, r.amount]));
    expect(by).toEqual({ tax: 2000, shield: 600, invest: 200, skills: 800, fun: 400, operating: 6000 });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(10_000);
  });
  it('SMarT: suggest +2 points only when income beats the recent median', () => {
    expect(smartSuggestion(40_000, [30_000, 35_000, 32_000], DEFAULT_SPLIT)).toMatchObject({ from: 10, to: 12, median: 32_000 });
    expect(smartSuggestion(30_000, [30_000, 35_000, 32_000], DEFAULT_SPLIT)).toBeNull();
    expect(smartSuggestion(40_000, [30_000], DEFAULT_SPLIT)).toBeNull();
  });
});
