// Pure game-balance functions. No DB access here -> easy to unit test and tune.
import type { Difficulty } from '@/db/types';

export const TASK_XP: Record<Difficulty, number> = { 1: 5, 2: 15, 3: 35, 4: 75, 5: 200 };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Trivial', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Epic' };

/** Coins are the spendable currency; 1 coin per 5 XP. */
export const coinsFor = (xp: number) => Math.round(xp / 5);

/** XP for a focus session: 20 XP per hour, rounded per 15 minutes. */
export const sessionXp = (minutes: number) => Math.floor(minutes / 15) * 5;

export const PERFECT_DAY_XP = 100;
export const WORKDAY_BONUS_XP = 60; // hit the daily hour target

/** Streak multiplier for habits: +5% per full week of streak, capped at +50%. */
export const streakMultiplier = (streakDays: number) => 1 + Math.min(0.5, Math.floor(streakDays / 7) * 0.05);

/** Total XP needed to REACH level n (level 1 = 0). Smooth curve: 50 * (n-1)^1.8 */
export const xpForLevel = (n: number) => Math.round(50 * Math.pow(Math.max(0, n - 1), 1.8));

export function levelFromXp(totalXp: number) {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= totalXp) lvl++;
  const base = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  return { level: lvl, into: totalXp - base, needed: next - base, progress: (totalXp - base) / (next - base) };
}

const TITLES: [number, string][] = [
  [1, 'Apprentice'], [5, 'Disciplined'], [10, 'Operator'], [15, 'Builder'], [20, 'Strategist'],
  [30, 'Capitalist'], [40, 'Tycoon'], [50, 'Sovereign']
];
export const titleForLevel = (lvl: number) => TITLES.filter(([l]) => lvl >= l).pop()![1];

/** Financial XP: reward behaviour, never amounts (so a big paycheck ≠ big XP). */
export const FINANCE_XP = {
  logTransaction: 2,
  logTransactionDailyCap: 20,
  payCardInFull: 50,
  saveDeposit: 25
};
