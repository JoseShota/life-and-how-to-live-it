import { describe, it, expect } from 'vitest';
import { levelFromXp, xpForLevel, streakMultiplier, sessionXp } from '../src/game/rules';
import { nextDayOfMonth, daysUntil, cardStatus } from '../src/finance/finance';

describe('game rules', () => {
  it('level curve is monotonic and level 1 starts at 0', () => {
    expect(xpForLevel(1)).toBe(0);
    for (let n = 1; n < 60; n++) expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
  });
  it('levelFromXp is consistent with xpForLevel', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(xpForLevel(5)).level).toBe(5);
    expect(levelFromXp(xpForLevel(5) - 1).level).toBe(4);
  });
  it('streak multiplier caps at +50%', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(7)).toBeCloseTo(1.05);
    expect(streakMultiplier(1000)).toBe(1.5);
  });
  it('session xp = 20 per hour, pro-rata per minute', () => {
    expect(sessionXp(2)).toBe(0);
    expect(sessionXp(15)).toBe(5);
    expect(sessionXp(50)).toBe(16);
    expect(sessionXp(60)).toBe(20);
  });
});

describe('finance', () => {
  it('nextDayOfMonth clamps to month end and rolls over', () => {
    expect(nextDayOfMonth(31, new Date(2026, 1, 10)).getDate()).toBe(28);
    expect(nextDayOfMonth(5, new Date(2026, 10, 20)).getMonth()).toBe(11);
  });
  it('daysUntil counts calendar days', () => {
    expect(daysUntil(new Date(2026, 10, 10), new Date(2026, 10, 5, 23))).toBe(5);
  });
  it('card status computes debt and utilization', () => {
    const acc = { id: 'c', name: 'C', institution: 'Banorte', type: 'credit' as const, creditLimit: 10000, cutoffDay: 1, paymentDueDay: 21, openingBalance: -2000, color: '#000', archived: false, order: 0 };
    const s = cardStatus(acc, [{ id: 't', accountId: 'c', date: '2026-11-01', amount: -1000, kind: 'expense', category: 'Food', createdAt: 0 }]);
    expect(s.debt).toBe(3000);
    expect(s.utilization).toBeCloseTo(0.3);
  });
});
