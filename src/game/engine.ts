// Side-effectful game actions. Every reward goes through `award` so the ledger stays the single source of truth.
import { db } from '@/db/db';
import type { Difficulty, Habit, Task, Transaction, XpSource } from '@/db/types';
import { splitLegs, transferLegs } from '@/finance/finance';
import { dateKey, parseKey, uid } from '@/lib/util';
import {
  TASK_XP, coinsFor, PERFECT_DAY_XP, GOOD_DAY_XP, WORKDAY_BONUS_XP, WEEKLY_SCORECARD, streakMultiplier, FINANCE_XP,
  MAX_FULL_EPICS_PER_DAY, MAX_SESSION_MINUTES, DEFAULT_WORK_TARGETS, targetsFor, allocateFocusXp, dayGrade, weeklyScore,
  type WorkTargets
} from './rules';
import { checkAchievements } from './achievements';

export async function award(source: XpSource, refId: string, xp: number, label: string, coins = coinsFor(xp), date = dateKey()) {
  await db.xp.add({ id: uid(), ts: Date.now(), date, source, refId, xp, coins, label });
}

export async function revoke(refId: string) {
  await db.xp.where('refId').equals(refId).delete();
}

/** Awards once per refId: a no-op if that refId is already in the ledger. */
export async function awardOnce(source: XpSource, refId: string, xp: number, label: string, coins = coinsFor(xp), date = dateKey()) {
  if (await db.xp.where('refId').equals(refId).count()) return false;
  await award(source, refId, xp, label, coins, date);
  return true;
}

/** Goal progress pays once per goal per month, however often the number is updated. */
export async function rewardGoalProgress(goalId: string, goalName: string) {
  return awardOnce('finance', `goal:${goalId}:${dateKey().slice(0, 7)}`, FINANCE_XP.saveDeposit, `Progress: ${goalName}`);
}

export async function totals() {
  let xp = 0, coins = 0;
  await db.xp.each(e => { xp += e.xp; coins += e.coins; });
  return { xp, coins };
}

// ---------- Tasks ----------
/** Epic quests are self-rated, so only the first Epic of the day pays Epic XP; later ones pay Hard. */
export async function completeTask(task: Task) {
  await db.tasks.update(task.id, { status: 'done', completedAt: Date.now() });
  let xp = TASK_XP[task.difficulty as Difficulty];
  if (task.difficulty === 5) {
    const today = await db.xp.where('date').equals(dateKey()).filter(e => e.source === 'task' && e.xp === TASK_XP[5] && e.refId !== `task:${task.id}`).count();
    if (today >= MAX_FULL_EPICS_PER_DAY) xp = TASK_XP[4];
  }
  await award('task', `task:${task.id}`, xp, `Quest: ${task.title}`);
  await checkAchievements();
}

export async function reopenTask(task: Task) {
  await db.tasks.update(task.id, { status: 'todo', completedAt: undefined });
  await revoke(`task:${task.id}`);
  await checkAchievements();
}

// ---------- Habits ----------
export async function habitStreak(habitId: string, upTo: string = dateKey()): Promise<number> {
  const logs = await db.habitLogs.where('habitId').equals(habitId).toArray();
  const done = new Set(logs.filter(l => l.done).map(l => l.date));
  let streak = 0;
  const d = new Date(upTo + 'T12:00:00');
  // today counts if done; if not done yet, streak continues from yesterday
  if (!done.has(dateKey(d))) d.setDate(d.getDate() - 1);
  while (done.has(dateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

export async function setHabit(habit: Habit, date: string, value: number) {
  const done = habit.kind === 'check' ? value >= 1 : value >= (habit.target ?? 1);
  const id = `${habit.id}:${date}`;
  await db.habitLogs.put({ id, habitId: habit.id, date, value, done });
  const ref = `habit:${id}`;
  await revoke(ref);
  if (done) {
    const streak = await habitStreak(habit.id, date);
    const xp = Math.round(habit.xp * streakMultiplier(streak));
    await award('habit', ref, xp, `${habit.name}${streak >= 7 ? ` (streak ${streak})` : ''}`, habit.intrinsic ? 0 : coinsFor(xp), date);
  }
  await evaluateDay(date);
}

/**
 * Makes the ledger hold exactly one row for `refId` with these values, or none when `xp` is null.
 * Rewrites only when something changed, so re-evaluating a day never re-fires reward toasts.
 */
async function syncAward(source: XpSource, refId: string, xp: number | null, label: string, coins: number, date: string) {
  const rows = await db.xp.where('refId').equals(refId).toArray();
  if (xp === null || xp <= 0) { if (rows.length) await revoke(refId); return; }
  if (rows.length === 1 && rows[0].xp === xp && rows[0].coins === coins && rows[0].date === date) return;
  if (rows.length) await revoke(refId);
  await award(source, refId, xp, label, coins, date);
}

export async function getWorkTargets(): Promise<WorkTargets> {
  const v = (await db.settings.get('workTargets'))?.value as WorkTargets | undefined;
  return v ?? DEFAULT_WORK_TARGETS;
}

/** Monday (local) of the week containing `date`. */
export function weekStartKey(date: string) {
  const d = parseKey(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

/**
 * Recomputes everything derived from a day: focus XP per session, the deep-work habit, the workday bonus,
 * the Perfect/Good Day grade and the weekly scorecard. Idempotent: safe to call any time.
 */
export async function evaluateDay(date: string = dateKey()) {
  const habits = (await db.habits.toArray()).filter(h => !h.archived);
  const targets = targetsFor(date, await getWorkTargets());
  const areas = new Map((await db.areas.toArray()).map(a => [a.id, a]));

  // Focus XP: only minutes up to the full target pay. Hobby areas earn XP but no coins.
  const sessions = await db.sessions.where('date').equals(date).toArray();
  const alloc = allocateFocusXp(sessions, targets.full);
  for (const s of sessions) {
    const xp = alloc.get(s.id) ?? 0;
    const area = areas.get(s.areaId);
    const coins = area?.kind === 'hobby' ? 0 : coinsFor(xp);
    await syncAward('session', `session:${s.id}`, xp, `Focus ${s.minutes}m · ${area?.short ?? ''}`, coins, date);
  }

  // Deep-work habit (done target) and workday bonus (full target).
  const hours = sessions.reduce((sum, x) => sum + x.minutes, 0) / 60;
  const workHabit = habits.find(h => h.kind === 'auto' && h.key === 'work');
  if (workHabit) {
    const id = `${workHabit.id}:${date}`;
    const done = hours >= targets.done;
    const prev = await db.habitLogs.get(id);
    await db.habitLogs.put({ ...prev, id, habitId: workHabit.id, date, value: Math.round(hours * 100) / 100, done });
    const streak = done ? await habitStreak(workHabit.id, date) : 0;
    const xp = Math.round(workHabit.xp * streakMultiplier(streak));
    await syncAward('habit', `habit:${id}`, done ? xp : null, `Deep work ${hours.toFixed(1)} h`, coinsFor(xp), date);
  }
  await syncAward('workday', `workday:${date}`, hours >= targets.full ? WORKDAY_BONUS_XP : null, `Full workday (${hours.toFixed(1)} h)`, coinsFor(WORKDAY_BONUS_XP), date);

  // Day grade: Perfect (all core, full versions) or Good (3 of 4 core, min versions count).
  const core = habits.filter(h => h.core);
  const logs = new Map((await db.habitLogs.where('date').equals(date).toArray()).map(l => [l.habitId, l]));
  const full = core.filter(h => logs.get(h.id)?.done && !logs.get(h.id)?.min).length;
  const any = core.filter(h => logs.get(h.id)?.done).length;
  const grade = dayGrade(core.length, full, any);
  await syncAward('perfect-day', `perfect:${date}`, grade === 'perfect' ? PERFECT_DAY_XP : null, 'Perfect day', coinsFor(PERFECT_DAY_XP), date);
  await syncAward('good-day', `good:${date}`, grade === 'good' ? GOOD_DAY_XP : null, 'Good day', coinsFor(GOOD_DAY_XP), date);

  await evaluateWeek(weekStartKey(date));
  await checkAchievements();
}

/** Read-only weekly stats for the scorecard (week starting on Monday `monday`). */
export async function weekStats(monday: string) {
  const d = parseKey(monday); d.setDate(d.getDate() + 6);
  const sunday = dateKey(d);
  const minutes = (await db.sessions.where('date').between(monday, sunday, true, true).toArray()).reduce((s, x) => s + x.minutes, 0);
  const byKey = async (key: string) => {
    const h = await db.habits.where('key').equals(key).first();
    if (!h) return 0;
    return (await db.habitLogs.where('habitId').equals(h.id).filter(l => l.done && l.date >= monday && l.date <= sunday).toArray()).length;
  };
  const goodDays = await db.xp.where('date').between(monday, sunday, true, true).filter(e => e.source === 'perfect-day' || e.source === 'good-day').count();
  const stats = { focusHours: minutes / 60, exerciseDays: await byKey('exercise'), moneyDays: await byKey('money'), goodDays };
  return { stats, sunday, ...weeklyScore(stats) };
}

/** Weekly scorecard bonus for the week starting on Monday `monday`, dated on that week's Sunday. */
export async function evaluateWeek(monday: string) {
  const score = await weekStats(monday);
  const sunday = score.sunday;
  await syncAward('weekly', `week:${monday}`, score.earned ? WEEKLY_SCORECARD.xp : null, `Weekly scorecard (${score.count}/4)`, coinsFor(WEEKLY_SCORECARD.xp), sunday);
  return score;
}

// ---------- Focus sessions ----------
/** Thrown when a session would overlap time that's already logged, so the same hour can't pay twice. */
export class SessionOverlapError extends Error {
  constructor() { super('That time overlaps a session you already logged.'); }
}

export async function logSession(areaId: string, start: number, end: number, taskId?: string, note?: string) {
  // A forgotten timer must not pay all night: cap any single session.
  end = Math.min(end, start + MAX_SESSION_MINUTES * 60000);
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 1) return null;
  const date = dateKey(start);
  const sameDay = await db.sessions.where('date').anyOf(date, dateKey(start - 864e5)).toArray();
  if (sameDay.some(s => s.start < end && s.end > start)) throw new SessionOverlapError();
  const id = uid();
  await db.sessions.add({ id, areaId, taskId, date, start, end, minutes, note });
  await evaluateDay(date); // pays the session's focus XP within the day's full target
  return id;
}

export async function deleteSession(id: string) {
  const s = await db.sessions.get(id);
  await db.sessions.delete(id);
  await revoke(`session:${id}`);
  if (s) await evaluateDay(s.date);
}

// ---------- Finance ----------
export async function rewardTransactionLogged(txId: string) {
  const today = dateKey();
  const todays = await db.xp.where('date').equals(today).filter(e => e.source === 'finance' && e.refId.startsWith('tx:')).toArray();
  const earned = todays.reduce((s, e) => s + e.xp, 0);
  if (earned < FINANCE_XP.logTransactionDailyCap) await award('finance', `tx:${txId}`, FINANCE_XP.logTransaction, 'Logged a transaction', 1);
}

export interface TxEdit {
  /** Positive MXN; the sign follows the transaction's kind. */
  amount: number;
  date: string;
  description?: string;
  accountId: string;
  /** Transfers only: the receiving account. */
  toAccountId?: string;
  category?: string;
  areaId?: string;
}

/**
 * Edits a transaction in place. The kind can't change, and XP never changes: the award was for the act
 * of logging, so its `tx:<id>` refId is kept. Transfers update both legs together, keeping their ids.
 */
export async function editTransaction(tx: Transaction, e: TxEdit) {
  const n = Math.abs(e.amount);
  if (!n) return;
  await db.transaction('rw', db.transactions, db.accounts, async () => {
    if (tx.kind === 'transfer' && tx.transferId) {
      if (!e.toAccountId || e.toAccountId === e.accountId) return;
      const { from, to } = splitLegs(await db.transactions.where('transferId').equals(tx.transferId).toArray());
      const toAcc = await db.accounts.get(e.toAccountId);
      await db.transactions.bulkPut(transferLegs({
        fromId: e.accountId, toId: e.toAccountId, amount: n, date: e.date, description: e.description,
        isCardPayment: toAcc?.type === 'credit', transferId: tx.transferId,
        ids: [from?.id ?? uid(), to?.id ?? uid()], createdAt: from?.createdAt ?? tx.createdAt
      }));
    } else {
      await db.transactions.put({
        ...tx, amount: tx.kind === 'income' ? n : -n, date: e.date, description: e.description,
        accountId: e.accountId, category: e.category ?? tx.category,
        areaId: tx.kind === 'income' ? e.areaId : undefined
      });
    }
  });
}

/**
 * Deletes a transaction (both legs for a transfer) and revokes its XP. The award sits on the first leg's
 * id, so revoke every leg: tapping delete on the second leg must not leave orphaned XP.
 */
export async function deleteTransaction(tx: Transaction) {
  const legs = tx.transferId ? await db.transactions.where('transferId').equals(tx.transferId).toArray() : [tx];
  await db.transaction('rw', db.transactions, db.xp, async () => {
    await db.transactions.bulkDelete(legs.map(t => t.id));
    for (const t of legs) await revoke(`tx:${t.id}`);
  });
  await checkAchievements();
}

// ---------- Rewards ----------
export async function redeem(rewardId: string) {
  const r = await db.rewards.get(rewardId);
  if (!r) return false;
  const { coins } = await totals();
  if (coins < r.cost) return false;
  await db.xp.add({ id: uid(), ts: Date.now(), date: dateKey(), source: 'reward', refId: `reward:${rewardId}:${Date.now()}`, xp: 0, coins: -r.cost, label: `Redeemed: ${r.title}` });
  return true;
}
