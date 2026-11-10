import { db } from '@/db/db';
import { dateKey } from '@/lib/util';
import { totaleroStreak } from '@/finance/finance';
import { WEALTH_LEVELS, levelsToAward, wealthSnapshot } from '@/finance/wealth';
import { coinsFor } from './rules';

export interface AchievementDef {
  key: string;
  icon: string;
  name: string;
  description: string;
  xp: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first-quest', icon: 'spear', name: 'First Blood', description: 'Complete your first quest', xp: 25 },
  { key: 'quests-50', icon: 'helmet', name: 'Questmaster', description: 'Complete 50 quests', xp: 250 },
  { key: 'perfect-1', icon: 'star', name: 'Perfect Day', description: 'Complete every core habit in a day', xp: 50 },
  { key: 'perfect-7', icon: 'laurel', name: 'Perfect Week', description: '7 Perfect Days in total', xp: 300 },
  { key: 'early-7', icon: 'sunrise', name: 'Dawn Patrol', description: 'Up by 5:45 seven days in a row', xp: 150 },
  { key: 'deep-100', icon: 'eye', name: 'Centurion', description: 'Log 100 hours of focus', xp: 500 },
  { key: 'workday-5', icon: 'anvil', name: 'Grinder', description: '5 full workdays (full deep-work target)', xp: 200 },
  { key: 'good-30', icon: 'laurel', name: 'Steady Hand', description: '30 Good or Perfect days', xp: 250 },
  { key: 'week-1', icon: 'scales', name: 'Scorecard', description: 'Earn a weekly scorecard', xp: 100 },
  { key: 'totalero-3', icon: 'card', name: 'Totalero', description: '3 card statements in a row paid in full on time', xp: 150 },
  { key: 'ledger-30', icon: 'tablet', name: 'Bookkeeper', description: 'Log 30 transactions', xp: 100 },
  { key: 'rainmaker', icon: 'amphora', name: 'Rainmaker', description: 'Win your first retainer client', xp: 500 },
  { key: 'conversations-20', icon: 'scroll', name: 'Agora Regular', description: 'Log 20 conversations with potential clients', xp: 150 },
  { key: 'first-income', icon: 'drachma', name: 'Paid', description: 'Register income linked to an activity', xp: 50 }
];

/** How far along one achievement is: `have` of `need`, in `unit` (shown in the Hall of Laurels). */
export interface Progress { have: number; need: number; unit: string }

/** The longest run of consecutive days in a set of date keys. */
export function longestRun(days: Iterable<string>) {
  let best = 0, run = 0, prev: Date | null = null;
  for (const k of [...new Set(days)].sort()) {
    const d = new Date(k + 'T12:00:00');
    run = prev && Math.round((d.getTime() - prev.getTime()) / 864e5) === 1 ? run + 1 : 1;
    prev = d;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Where every achievement stands, from the real data. An achievement is earned when `have >= need`; the same
 * numbers feed the Hall of Laurels, so what it shows and what unlocks can never disagree.
 */
export async function achievementProgress(): Promise<Record<string, Progress>> {
  const doneTasks = await db.tasks.where('status').equals('done').count();
  const perfect = await db.xp.where('source').equals('perfect-day').count();
  const workdays = await db.xp.where('source').equals('workday').count();
  const goodDays = perfect + await db.xp.where('source').equals('good-day').count();
  const weeks = await db.xp.where('source').equals('weekly').count();
  const minutes = (await db.sessions.toArray()).reduce((s, x) => s + x.minutes, 0);
  // A transfer has two legs but is one logged transaction.
  const txs = new Set((await db.transactions.toArray()).map(t => t.transferId ?? t.id)).size;
  const income = await db.transactions.filter(t => t.kind === 'income' && !!t.areaId).count();
  const retainerWon = await db.opportunities.filter(o => o.kind === 'retainer' && o.status === 'won').count();
  const conversations = await db.pipelineEvents.where('kind').equals('conversation').count();
  const totalero = totaleroStreak(await db.accounts.toArray(), await db.transactions.toArray(), await db.statements.toArray());
  const wake = await db.habits.where('key').equals('wake').first();
  const wakeRun = wake ? longestRun((await db.habitLogs.where('habitId').equals(wake.id).toArray()).filter(l => l.done).map(l => l.date)) : 0;
  return {
    'first-quest': { have: doneTasks, need: 1, unit: 'quest' },
    'quests-50': { have: doneTasks, need: 50, unit: 'quests' },
    'perfect-1': { have: perfect, need: 1, unit: 'perfect day' },
    'perfect-7': { have: perfect, need: 7, unit: 'perfect days' },
    'early-7': { have: wakeRun, need: 7, unit: 'days in a row (best run)' },
    'deep-100': { have: Math.floor(minutes / 60), need: 100, unit: 'hours' },
    'workday-5': { have: workdays, need: 5, unit: 'full workdays' },
    'good-30': { have: goodDays, need: 30, unit: 'good or perfect days' },
    'week-1': { have: weeks, need: 1, unit: 'scorecard' },
    'ledger-30': { have: txs, need: 30, unit: 'transactions' },
    'totalero-3': { have: totalero, need: 3, unit: 'statements in a row' },
    'first-income': { have: income, need: 1, unit: 'income' },
    rainmaker: { have: retainerWon, need: 1, unit: 'retainer' },
    'conversations-20': { have: conversations, need: 20, unit: 'conversations' }
  };
}

async function conditions(): Promise<Record<string, boolean>> {
  const p = await achievementProgress();
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.have >= v.need]));
}

/** Highest wealth level reached (milestones live in the ledger as `wl:<n>` and are never taken back). */
export async function wealthLevelReached() {
  const rows = await db.xp.where('source').equals('milestone').toArray();
  return rows.reduce((m, e) => Math.max(m, Number(e.refId.split(':')[1]) || 0), 0);
}

export async function loadWealthSnapshot() {
  const spendingEstimate = (await db.settings.get('spendingEstimate'))?.value as number | undefined;
  return wealthSnapshot({ accounts: await db.accounts.toArray(), txs: await db.transactions.toArray(), statements: await db.statements.toArray(), spendingEstimate });
}

/**
 * Awards wealth levels reached for the first time. Milestones are permanent on purpose: spending the shield in a
 * real emergency is what it's for, so it never costs XP. Investing still follows today's shield (investShare).
 */
export async function evaluateWealth() {
  const snap = await loadWealthSnapshot();
  for (const n of levelsToAward(await wealthLevelReached(), snap.qualifies)) {
    const def = WEALTH_LEVELS[n - 1];
    await db.xp.put({ id: `wl:${n}`, ts: Date.now(), date: dateKey(), source: 'milestone', refId: `wl:${n}`, xp: def.xp, coins: coinsFor(def.xp), label: `Wealth level ${n}: ${def.name}` });
    const ach = { key: `wl:${n}`, icon: 'temple', name: `Wealth level ${n}: ${def.name}`, description: def.unlock, xp: def.xp };
    listeners.forEach(l => l(ach));
  }
}

type Listener = (a: AchievementDef) => void;
const listeners = new Set<Listener>();
export const onAchievement = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

let running = false;
export async function checkAchievements() {
  if (running) return;
  running = true;
  try {
    const c = await conditions();
    const have = new Set((await db.unlocked.toArray()).map(u => u.key));
    for (const a of ACHIEVEMENTS) {
      // Undoing what earned an achievement takes it back, so the Hall of Laurels stays honest.
      if (!c[a.key] && have.has(a.key)) {
        await db.unlocked.delete(a.key);
        await db.xp.where('refId').equals(`ach:${a.key}`).delete();
        continue;
      }
      if (c[a.key] && !have.has(a.key)) {
        await db.unlocked.put({ key: a.key, unlockedAt: Date.now() });
        await db.xp.put({ id: `ach:${a.key}`, ts: Date.now(), date: dateKey(), source: 'achievement', refId: `ach:${a.key}`, xp: a.xp, coins: Math.round(a.xp / 5), label: `Achievement: ${a.name}` });
        listeners.forEach(l => l(a));
      }
    }
    await evaluateWealth();
  } finally {
    running = false;
  }
}
