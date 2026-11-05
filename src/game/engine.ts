// Side-effectful game actions. Every reward goes through `award` so the ledger stays the single source of truth.
import { db } from '@/db/db';
import type { Difficulty, Habit, Task, XpSource } from '@/db/types';
import { dateKey, uid } from '@/lib/util';
import {
  TASK_XP, coinsFor, sessionXp, PERFECT_DAY_XP, WORKDAY_BONUS_XP, streakMultiplier, FINANCE_XP
} from './rules';
import { checkAchievements } from './achievements';

export async function award(source: XpSource, refId: string, xp: number, label: string, coins = coinsFor(xp), date = dateKey()) {
  await db.xp.add({ id: uid(), ts: Date.now(), date, source, refId, xp, coins, label });
}

export async function revoke(refId: string) {
  await db.xp.where('refId').equals(refId).delete();
}

export async function totals() {
  let xp = 0, coins = 0;
  await db.xp.each(e => { xp += e.xp; coins += e.coins; });
  return { xp, coins };
}

// ---------- Tasks ----------
export async function completeTask(task: Task) {
  await db.tasks.update(task.id, { status: 'done', completedAt: Date.now() });
  const xp = TASK_XP[task.difficulty as Difficulty];
  await award('task', `task:${task.id}`, xp, `Quest: ${task.title}`);
  await checkAchievements();
}

export async function reopenTask(task: Task) {
  await db.tasks.update(task.id, { status: 'todo', completedAt: undefined });
  await revoke(`task:${task.id}`);
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
    await award('habit', ref, xp, `${habit.name}${streak >= 7 ? ` (streak ${streak})` : ''}`, coinsFor(xp), date);
  }
  await evaluateDay(date);
}

/** Auto habit (work hours) + Perfect Day bonus. Idempotent: safe to call any time. */
export async function evaluateDay(date: string = dateKey()) {
  const habits = (await db.habits.toArray()).filter(h => !h.archived);
  const workHabit = habits.find(h => h.kind === 'auto' && h.key === 'work');
  if (workHabit) {
    const minutes = (await db.sessions.where('date').equals(date).toArray()).reduce((s, x) => s + x.minutes, 0);
    const hours = minutes / 60;
    const done = hours >= (workHabit.target ?? 8);
    const id = `${workHabit.id}:${date}`;
    const prev = await db.habitLogs.get(id);
    await db.habitLogs.put({ id, habitId: workHabit.id, date, value: Math.round(hours * 100) / 100, done });
    if (done !== !!prev?.done) {
      await revoke(`workday:${date}`);
      if (done) await award('workday', `workday:${date}`, WORKDAY_BONUS_XP + workHabit.xp, `Full workday (${hours.toFixed(1)} h)`, undefined, date);
    }
  }
  const core = habits.filter(h => h.core);
  const logs = await db.habitLogs.where('date').equals(date).toArray();
  const doneIds = new Set(logs.filter(l => l.done).map(l => l.habitId));
  const perfect = core.length > 0 && core.every(h => doneIds.has(h.id));
  const ref = `perfect:${date}`;
  const had = (await db.xp.where('refId').equals(ref).count()) > 0;
  if (perfect && !had) await award('perfect-day', ref, PERFECT_DAY_XP, 'Perfect day', undefined, date);
  if (!perfect && had) await revoke(ref);
  await checkAchievements();
}

// ---------- Focus sessions ----------
export async function logSession(areaId: string, start: number, end: number, taskId?: string, note?: string) {
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 1) return null;
  const id = uid();
  const date = dateKey(start);
  await db.sessions.add({ id, areaId, taskId, date, start, end, minutes, note });
  const xp = sessionXp(minutes);
  if (xp > 0) {
    const area = await db.areas.get(areaId);
    await award('session', `session:${id}`, xp, `Focus ${minutes}m · ${area?.short ?? ''}`, undefined, date);
  }
  await evaluateDay(date);
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

// ---------- Rewards ----------
export async function redeem(rewardId: string) {
  const r = await db.rewards.get(rewardId);
  if (!r) return false;
  const { coins } = await totals();
  if (coins < r.cost) return false;
  await db.xp.add({ id: uid(), ts: Date.now(), date: dateKey(), source: 'reward', refId: `reward:${rewardId}:${Date.now()}`, xp: 0, coins: -r.cost, label: `Redeemed: ${r.title}` });
  return true;
}
