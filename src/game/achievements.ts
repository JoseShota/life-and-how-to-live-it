import { db } from '@/db/db';
import { dateKey } from '@/lib/util';
import { moneyIncome, totaleroStreak } from '@/finance/finance';
import type { Opportunity } from '@/db/types';
import { WEALTH_LEVELS, levelsToAward, wealthSnapshot } from '@/finance/wealth';
import { coinsFor } from './rules';

/** The four roads the laurels follow: what the user said they are after (2026-11-10). */
export type Road = 'body' | 'craft' | 'treasury' | 'engine';
export const ROADS: { key: Road; name: string; aim: string }[] = [
  { key: 'body', name: 'The Body', aim: 'exercise every day, up early without a fight, eat well' },
  { key: 'craft', name: 'The Craft', aim: 'deep work, finished quests, days that hold' },
  { key: 'treasury', name: 'The Treasury', aim: 'income made by your money, not your hours' },
  { key: 'engine', name: 'The Engine', aim: 'steady income: a job, or freelance across your fields' }
];

export interface AchievementDef {
  key: string;
  icon: string;
  name: string;
  description: string;
  xp: number;
  road: Road;
}

// Keys never change (they are in the user's `unlocked` table and ledger). Tiers of one line share a name.
export const ACHIEVEMENTS: AchievementDef[] = [
  // The Body: the three habits, by their best run of days in a row (minimum versions keep a run alive).
  { key: 'exercise-7', icon: 'discus', name: 'Iron Body I', description: 'Exercise 7 days in a row', xp: 100, road: 'body' },
  { key: 'exercise-30', icon: 'discus', name: 'Iron Body II', description: 'Exercise 30 days in a row', xp: 250, road: 'body' },
  { key: 'exercise-100', icon: 'discus', name: 'Iron Body III', description: 'Exercise 100 days in a row', xp: 500, road: 'body' },
  { key: 'early-7', icon: 'sunrise', name: 'Dawn Patrol I', description: 'Up on time 7 days in a row', xp: 150, road: 'body' },
  { key: 'early-21', icon: 'sunrise', name: 'Dawn Patrol II', description: 'Up on time 21 days in a row', xp: 250, road: 'body' },
  { key: 'early-66', icon: 'sunrise', name: 'Dawn Patrol III', description: 'Up on time 66 days in a row: by now it wakes you', xp: 500, road: 'body' },
  { key: 'eat-7', icon: 'bowl', name: 'The Table I', description: 'Eat well 7 days in a row', xp: 75, road: 'body' },
  { key: 'eat-30', icon: 'bowl', name: 'The Table II', description: 'Eat well 30 days in a row', xp: 200, road: 'body' },
  { key: 'eat-100', icon: 'bowl', name: 'The Table III', description: 'Eat well 100 days in a row', xp: 400, road: 'body' },
  { key: 'sleep-21', icon: 'moon', name: 'Night Owl Reformed', description: 'Sleep 7.5 h or more, 21 nights in a row', xp: 250, road: 'body' },
  // The Craft
  { key: 'first-quest', icon: 'spear', name: 'First Blood', description: 'Complete your first quest', xp: 25, road: 'craft' },
  { key: 'quests-50', icon: 'helmet', name: 'Questmaster I', description: 'Complete 50 quests', xp: 250, road: 'craft' },
  { key: 'quests-200', icon: 'helmet', name: 'Questmaster II', description: 'Complete 200 quests', xp: 400, road: 'craft' },
  { key: 'perfect-1', icon: 'star', name: 'Perfect Day', description: 'Complete every core habit in a day', xp: 50, road: 'craft' },
  { key: 'perfect-7', icon: 'laurel', name: 'Perfect Week', description: '7 Perfect Days in total', xp: 300, road: 'craft' },
  { key: 'deep-100', icon: 'eye', name: 'Centurion I', description: 'Log 100 hours of focus', xp: 500, road: 'craft' },
  { key: 'deep-500', icon: 'eye', name: 'Centurion II', description: 'Log 500 hours of focus', xp: 500, road: 'craft' },
  { key: 'workday-5', icon: 'anvil', name: 'Grinder', description: '5 full workdays (full deep-work target)', xp: 200, road: 'craft' },
  { key: 'good-30', icon: 'laurel', name: 'Steady Hand I', description: '30 Good or Perfect days', xp: 250, road: 'craft' },
  { key: 'good-100', icon: 'laurel', name: 'Steady Hand II', description: '100 Good or Perfect days', xp: 500, road: 'craft' },
  { key: 'week-1', icon: 'scales', name: 'Scorecard I', description: 'Earn a weekly scorecard', xp: 100, road: 'craft' },
  { key: 'week-8', icon: 'scales', name: 'Scorecard II', description: 'Earn 8 weekly scorecards', xp: 300, road: 'craft' },
  // The Treasury: order first, then money that earns.
  { key: 'ledger-30', icon: 'tablet', name: 'Bookkeeper', description: 'Log 30 transactions', xp: 100, road: 'treasury' },
  { key: 'totalero-3', icon: 'card', name: 'Totalero', description: '3 card statements in a row paid in full on time', xp: 150, road: 'treasury' },
  { key: 'money-1', icon: 'drachma', name: 'Money at Work I', description: 'Log the first income your money made (interest or investment returns)', xp: 100, road: 'treasury' },
  { key: 'money-pct-1', icon: 'drachma', name: 'Money at Work II', description: 'Your money earns 1 % of a month of your spending', xp: 200, road: 'treasury' },
  { key: 'money-pct-10', icon: 'drachma', name: 'Money at Work III', description: 'Your money earns 10 % of a month of your spending', xp: 400, road: 'treasury' },
  { key: 'money-pct-100', icon: 'temple', name: 'Money at Work IV', description: 'Your money pays for your whole month', xp: 500, road: 'treasury' },
  // The Engine
  { key: 'first-income', icon: 'drachma', name: 'Paid', description: 'Register income linked to an activity', xp: 50, road: 'engine' },
  { key: 'fields-3', icon: 'path', name: 'Three Fields', description: 'Be paid in 3 different areas (research, web, data, teaching…)', xp: 200, road: 'engine' },
  { key: 'conversations-20', icon: 'scroll', name: 'Agora Regular', description: 'Log 20 conversations with potential clients or employers', xp: 150, road: 'engine' },
  { key: 'proposals-5', icon: 'quill', name: 'Five Offers', description: 'Send 5 proposals or applications', xp: 150, road: 'engine' },
  { key: 'case-3', icon: 'column', name: 'Proof', description: 'Publish 3 case studies', xp: 200, road: 'engine' },
  { key: 'rainmaker', icon: 'amphora', name: 'Steady Income', description: 'Win a job or a retainer: income that comes every month', xp: 500, road: 'engine' }
];

/** Income that comes every month: a job or a retainer (the user, 2026-11-10: "a steady income in a job, or freelance"). */
export const isSteady = (o: Pick<Opportunity, 'kind'>) => o.kind === 'job' || o.kind === 'retainer';

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
  const steadyWon = await db.opportunities.filter(o => isSteady(o) && o.status === 'won').count();
  const conversations = await db.pipelineEvents.where('kind').equals('conversation').count();
  const totalero = totaleroStreak(await db.accounts.toArray(), await db.transactions.toArray(), await db.statements.toArray());
  // Best run of days in a row for a seeded habit, by its stable key (0 when the habit was removed).
  const run = async (key: string) => {
    const h = await db.habits.where('key').equals(key).first();
    return h ? longestRun((await db.habitLogs.where('habitId').equals(h.id).toArray()).filter(l => l.done).map(l => l.date)) : 0;
  };
  const [wakeRun, exerciseRun, eatRun, sleepRun] = [await run('wake'), await run('exercise'), await run('eat'), await run('sleep')];
  const allTx = await db.transactions.toArray();
  const paidAreas = new Set(allTx.filter(t => t.kind === 'income' && !!t.areaId).map(t => t.areaId)).size;
  const proposals = await db.pipelineEvents.where('kind').equals('proposal').count();
  const cases = await db.pipelineEvents.where('kind').equals('case-study').count();
  // Money at work: what money earned per month (last 90 days) against a month of spending (finance/wealth.ts).
  const money = moneyIncome(allTx, dateKey());
  const spending = (await loadWealthSnapshot()).spending;
  const pct = spending ? Math.floor((money.monthly / spending) * 1000) / 10 : 0;
  const days = (have: number, need: number): Progress => ({ have, need, unit: 'days in a row (best run)' });
  return {
    'exercise-7': days(exerciseRun, 7), 'exercise-30': days(exerciseRun, 30), 'exercise-100': days(exerciseRun, 100),
    'early-7': days(wakeRun, 7), 'early-21': days(wakeRun, 21), 'early-66': days(wakeRun, 66),
    'eat-7': days(eatRun, 7), 'eat-30': days(eatRun, 30), 'eat-100': days(eatRun, 100),
    'sleep-21': { have: sleepRun, need: 21, unit: 'nights in a row (best run)' },
    'first-quest': { have: doneTasks, need: 1, unit: 'quest' },
    'quests-50': { have: doneTasks, need: 50, unit: 'quests' },
    'quests-200': { have: doneTasks, need: 200, unit: 'quests' },
    'perfect-1': { have: perfect, need: 1, unit: 'perfect day' },
    'perfect-7': { have: perfect, need: 7, unit: 'perfect days' },
    'deep-100': { have: Math.floor(minutes / 60), need: 100, unit: 'hours' },
    'deep-500': { have: Math.floor(minutes / 60), need: 500, unit: 'hours' },
    'workday-5': { have: workdays, need: 5, unit: 'full workdays' },
    'good-30': { have: goodDays, need: 30, unit: 'good or perfect days' },
    'good-100': { have: goodDays, need: 100, unit: 'good or perfect days' },
    'week-1': { have: weeks, need: 1, unit: 'scorecard' },
    'week-8': { have: weeks, need: 8, unit: 'scorecards' },
    'ledger-30': { have: txs, need: 30, unit: 'transactions' },
    'totalero-3': { have: totalero, need: 3, unit: 'statements in a row' },
    'money-1': { have: money.ever > 0 ? 1 : 0, need: 1, unit: 'income' },
    'money-pct-1': { have: pct, need: 1, unit: '% of a month of spending' },
    'money-pct-10': { have: pct, need: 10, unit: '% of a month of spending' },
    'money-pct-100': { have: pct, need: 100, unit: '% of a month of spending' },
    'first-income': { have: income, need: 1, unit: 'income' },
    'fields-3': { have: paidAreas, need: 3, unit: 'areas' },
    'conversations-20': { have: conversations, need: 20, unit: 'conversations' },
    'proposals-5': { have: proposals, need: 5, unit: 'proposals' },
    'case-3': { have: cases, need: 3, unit: 'case studies' },
    rainmaker: { have: steadyWon, need: 1, unit: 'won' }
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
    const ach: AchievementDef = { key: `wl:${n}`, icon: 'temple', name: `Wealth level ${n}: ${def.name}`, description: def.unlock, xp: def.xp, road: 'treasury' };
    listeners.forEach(l => l(ach));
  }
}

/**
 * Laurels measured over a moving window (what money earned in the last 90 days) are kept once won, like wealth
 * levels: a quiet quarter is not an undo, and XP is never taken away for time passing.
 */
const KEPT = new Set(['money-pct-1', 'money-pct-10', 'money-pct-100']);

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
        if (KEPT.has(a.key)) continue;
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
