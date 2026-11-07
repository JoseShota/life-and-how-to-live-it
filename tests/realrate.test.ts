import { describe, it, expect } from 'vitest';
import { autoFloorRate, DEFAULT_FLOOR_RATE, extraHoursByArea, hoursOfWork, netIncome, realRates, SHARED_WORK_AREA } from '../src/finance/finance';
import { invoiceFromSubtotal, resicoRate } from '../src/finance/tax';
import type { Area, AreaHours, Session, Transaction } from '../src/db/types';

const area = (id: string, monetizable = true): Area => ({ id, name: id, short: id, icon: 'dot', color: '#000', kind: monetizable ? 'work' : 'hobby', weeklyHoursTarget: 0, monetizable, order: 0, archived: false });
const ses = (areaId: string, hours: number, date = '2026-10-10'): Session => ({ id: areaId + hours + date, areaId, date, start: 0, end: 0, minutes: hours * 60 });
let n = 0;
const income = (areaId: string, amount: number, date = '2026-10-05', extra: Partial<Transaction> = {}): Transaction => ({ id: `i${n++}`, accountId: 'd', date, amount, kind: 'income', category: 'Freelance', areaId, createdAt: 0, ...extra });
const expense = (areaId: string | undefined, amount: number, date = '2026-10-06', extra: Partial<Transaction> = {}): Transaction => ({ id: `e${n++}`, accountId: 'd', date, amount: -amount, kind: 'expense', category: 'Tools/Software', areaId, createdAt: 0, ...extra });
const resico = (areaId: string, subtotal: number, date = '2026-10-05', company = true) => {
  const inv = invoiceFromSubtotal(subtotal, true, company);
  const { deposit, ...incomeTax } = inv;
  return income(areaId, deposit, date, { incomeTax });
};
const base = { from: '2026-10-01', to: '2026-12-31', extra: [] as AreaHours[], creditIva: true };

describe('real MXN per hour', () => {
  it('RESICO income: subtotal minus ISR at the month\'s rate; IVA and withholdings excluded', () => {
    const tx = resico('free', 20000);
    expect(netIncome(tx, () => 0.01)).toBe(19800);
    const r = realRates({ ...base, areas: [area('free')], txs: [tx], sessions: [ses('free', 20)] }).rows[0];
    expect(r.gross).toBe(tx.amount);
    expect(r.net).toBe(19800);
    expect(r.realRate).toBe(990);
  });

  it('the rate adapts to the month: a bigger month moves every invoice of that month to a higher bracket', () => {
    const small = realRates({ ...base, areas: [area('free')], txs: [resico('free', 20000)], sessions: [ses('free', 10)] }).rows[0];
    const big = realRates({ ...base, areas: [area('free')], txs: [resico('free', 20000), resico('free', 40000, '2026-10-20')], sessions: [ses('free', 10)] }).rows[0];
    expect(resicoRate(60000)).toBe(0.015);
    expect(big.net).toBeCloseTo(60000 * (1 - 0.015));
    expect(small.net).toBe(19800);
  });

  it('salary counts what landed; untaxed income as it is', () => {
    const sal = income('cide', 15000, '2026-10-15', { incomeTax: { kind: 'salary', subtotal: 18000, ivaCharged: 0, isrWithheld: 3000, ivaWithheld: 0, clientIsCompany: true } });
    expect(netIncome(sal, () => 0.025)).toBe(15000);
    expect(netIncome(income('x', 500), () => 0.025)).toBe(500);
  });

  it('subtracts the area\'s costs (minus creditable IVA only when IVA is charged)', () => {
    const txs = [income('free', 10000), expense('free', 1160, '2026-10-06', { ivaCreditable: 160 })];
    expect(realRates({ ...base, areas: [area('free')], txs, sessions: [ses('free', 10)] }).rows[0]).toMatchObject({ costs: 1000, realRate: 900 });
    expect(realRates({ ...base, creditIva: false, areas: [area('free')], txs, sessions: [ses('free', 10)] }).rows[0]).toMatchObject({ costs: 1160, realRate: 884 });
  });

  it('non-focus hours lower the rate: one-off in range, weekly pro-rata, until respected', () => {
    const extra: AreaHours[] = [
      { id: 'a', areaId: 'cide', date: '2026-10-01', hours: 6, weekly: true, createdAt: 0 },                      // 14 days → 12 h
      { id: 'b', areaId: 'cide', date: '2026-10-03', hours: 2, createdAt: 0 },                                    // one-off
      { id: 'c', areaId: 'cide', date: '2026-09-20', hours: 2, createdAt: 0 },                                    // out of range
      { id: 'd', areaId: 'free', date: '2026-09-01', hours: 7, weekly: true, until: '2026-10-07', createdAt: 0 }   // 7 days → 7 h
    ];
    const m = extraHoursByArea(extra, '2026-10-01', '2026-10-14');
    expect(m.get('cide')).toBeCloseTo(14);
    expect(m.get('free')).toBeCloseTo(7);
    const r = realRates({ ...base, to: '2026-10-14', extra, areas: [area('cide')], txs: [income('cide', 2800)], sessions: [ses('cide', 6)] }).rows[0];
    expect(r).toMatchObject({ focusHours: 6, otherHours: 14, hours: 20, realRate: 140, grossRate: 2800 / 6 });
  });

  it('shared work costs follow the earning hours; costs-only areas still show', () => {
    const txs = [income('a', 3000), income('b', 3000), expense(SHARED_WORK_AREA, 400), expense('video', 900)];
    const { rows, average } = realRates({ ...base, areas: [area('a'), area('b'), area('video', false)], txs, sessions: [ses('a', 30), ses('b', 10)] });
    const by = (id: string) => rows.find(r => r.area.id === id)!;
    expect(by('a').sharedCosts).toBe(300);
    expect(by('b').sharedCosts).toBe(100);
    expect(by('video')).toMatchObject({ costs: 900, sharedCosts: 0 });
    expect(average).toBe((6000 - 400) / 40);
    expect(rows.map(r => r.area.id)).toEqual(['b', 'a', 'video']); // ranked by real rate
  });

  it('verdicts: below the floor, or 2× the average, with enough hours', () => {
    const txs = [income('low', 1000), income('high', 30000), income('mid', 3000)]; // 100, 3000 and 300 MXN/h; average ≈ 1,097
    const { rows } = realRates({ ...base, floorRate: 250, areas: [area('low'), area('high'), area('mid'), area('tiny')], txs: [...txs, income('tiny', 10)], sessions: [ses('low', 10), ses('high', 10), ses('mid', 10), ses('tiny', 1)] });
    const by = (id: string) => rows.find(r => r.area.id === id)!;
    expect(by('low').verdict).toBe('below-floor');
    expect(by('high').verdict).toBe('scale');
    expect(by('mid').verdict).toBe(null);
    expect(by('tiny').verdict).toBe(null); // 1 h is too little to judge
  });

  it('outside the window counts nothing; purchases in hours of work', () => {
    const r = realRates({ ...base, from: '2026-11-01', areas: [area('free')], txs: [income('free', 5000)], sessions: [ses('free', 5)] }).rows[0];
    expect(r).toMatchObject({ gross: 0, hours: 0, realRate: null });
    expect(hoursOfWork(-1500, 500)).toBe(3);
    expect(hoursOfWork(-1500, null)).toBe(null);
  });
});

describe('floor from real numbers', () => {
  it('spending ÷ (1 − savings) over logged paid hours per month', () => {
    // 27,000 / 0.9 = 30,000 needed; 300 h in 90 days = 100 h/month → 300 MXN/h.
    expect(autoFloorRate({ monthlySpending: 27000, savingsPct: 10, paidHours: 300, historyDays: 90, plannedWeeklyHours: 40 }))
      .toMatchObject({ rate: 300, need: 30000, hoursPerMonth: 100, hoursFrom: 'logged', ready: true });
  });
  it('a short history is scaled to a month; under two weeks the area targets stand in', () => {
    expect(autoFloorRate({ monthlySpending: 20000, savingsPct: 0, paidHours: 50, historyDays: 15, plannedWeeklyHours: 30 }).hoursPerMonth).toBe(100);
    const early = autoFloorRate({ monthlySpending: 20000, savingsPct: 0, paidHours: 5, historyDays: 3, plannedWeeklyHours: 30 });
    expect(early).toMatchObject({ hoursFrom: 'targets', hoursPerMonth: 130 });
    expect(early.rate).toBe(Math.round(20000 / 130));
  });
  it('more savings or fewer hours raise the floor', () => {
    const base = { monthlySpending: 24000, savingsPct: 10, paidHours: 240, historyDays: 90, plannedWeeklyHours: 0 };
    expect(autoFloorRate({ ...base, savingsPct: 20 }).rate).toBeGreaterThan(autoFloorRate(base).rate);
    expect(autoFloorRate({ ...base, paidHours: 120 }).rate).toBeGreaterThan(autoFloorRate(base).rate);
  });
  it('without spending data it falls back to the placeholder', () => {
    expect(autoFloorRate({ monthlySpending: null, savingsPct: 10, paidHours: 300, historyDays: 90, plannedWeeklyHours: 40 })).toMatchObject({ ready: false, rate: DEFAULT_FLOOR_RATE });
  });
});
