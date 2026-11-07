// Side-effectful game actions. Every reward goes through `award` so the ledger stays the single source of truth.
import { db, TAX_MONTHLY_RECURRENCE } from '@/db/db';
import { instanceId, nextDue } from '@/lib/recurrence';
import type { Difficulty, Habit, IncomeTax, Opportunity, PipelineEventKind, Statement, Task, Transaction, XpSource } from '@/db/types';
import { DEFAULT_TAX_PROFILE, monthTax, monthlyDueDate, type TaxProfile } from '@/finance/tax';
import { mxn } from '@/lib/util';
import { cutoffOnOrAfter, splitLegs, statementStatus, transferLegs } from '@/finance/finance';
import { dateKey, parseKey, uid } from '@/lib/util';
import {
  TASK_XP, coinsFor, PERFECT_DAY_XP, GOOD_DAY_XP, WORKDAY_BONUS_XP, WEEKLY_SCORECARD, streakMultiplier, FINANCE_XP,
  MAX_FULL_EPICS_PER_DAY, MAX_SESSION_MINUTES, targetsFor, allocateFocusXp, dayGrade, weeklyScore,
  MIN_VERSION_SHARE, WORK_MIN_HOURS, SHIELD_EVERY, SHIELD_MAX, LEAD_XP, CONVERSATION_DAILY_CAP_XP,
  REVIEW_XP, reviewComplete, reviewWeekFor, withTargetDefaults, type WorkTargets, type TeachingSchedule
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
  if (task.recurrence) await spawnNext(task, dateKey());
  await checkAchievements();
}

export async function reopenTask(task: Task) {
  await db.tasks.update(task.id, { status: 'todo', completedAt: undefined });
  await revoke(`task:${task.id}`);
  // Undo the instance that completing it created, unless it has been used since (edited, timed or done).
  if (task.recurrence && task.completedAt) {
    const next = await db.tasks.get(nextInstance(task, dateKey(task.completedAt)).id);
    const used = !next || next.status !== 'todo' || next.title !== task.title || (await db.sessions.filter(s => s.taskId === next.id).count()) > 0;
    if (!used) await db.tasks.delete(next.id);
  }
  await checkAchievements();
}

// ---------- Repeating quests (P1-1) ----------
/** The next instance of a repeating quest completed on `doneOn`: its deterministic id and due date. */
export function nextInstance(task: Task, doneOn: string) {
  const r = task.recurrence!;
  const due = nextDue(r, task.dueDate, doneOn);
  // The tax series keeps its month-based ids (`tax-m-<yyyy-mm>`), the same ones ensureTaxQuests uses, so they can't collide.
  if (r.series === TAX_MONTHLY_RECURRENCE.series && task.id.startsWith('tax-m-')) {
    const [y, m] = task.id.slice(6).split('-').map(Number);
    const month = dateKey(new Date(y, m, 1)).slice(0, 7);
    return { id: `tax-m-${month}`, due: monthlyDueDate(month), month };
  }
  return { id: instanceId(r.series, due), due, month: undefined };
}

/** Creates the next instance once (deterministic id). Returns its id. */
export async function spawnNext(task: Task, doneOn: string) {
  const n = nextInstance(task, doneOn);
  if (await db.tasks.get(n.id)) return n.id;
  if (n.month) {
    const area = await db.areas.get(task.areaId) ? task.areaId : (await taxArea())?.id;
    if (area) await db.tasks.add(await taxMonthQuest(n.month, area));
    return n.id;
  }
  await db.tasks.add({
    id: n.id, areaId: task.areaId, title: task.title, notes: task.notes, difficulty: task.difficulty, priority: task.priority,
    dueDate: n.due, status: 'todo', createdAt: Date.now(), recurrence: task.recurrence
  });
  return n.id;
}

// ---------- Habits ----------
/** Dates on which a streak shield covered this habit (the day counts as "not broken", not as done). */
async function shieldedDates(habitId: string) {
  const rows = await db.xp.where('refId').startsWith(`shield:use:${habitId}:`).toArray();
  return new Set(rows.map(r => r.refId.split(':')[3]));
}

export async function habitStreak(habitId: string, upTo: string = dateKey()): Promise<number> {
  const logs = await db.habitLogs.where('habitId').equals(habitId).toArray();
  const done = new Set(logs.filter(l => l.done).map(l => l.date));
  const shielded = await shieldedDates(habitId);
  let streak = 0;
  const d = parseKey(upTo);
  // today counts if done; if not done yet, streak continues from yesterday
  if (!done.has(dateKey(d))) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = dateKey(d);
    if (done.has(k)) streak++;
    else if (!shielded.has(k)) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Checks a habit for `date`. `min` = done in its minimum version: keeps the streak, half XP, counts for a Good Day only. */
export async function setHabit(habit: Habit, date: string, value: number, min = false) {
  const done = habit.kind === 'check' ? value >= 1 : value >= (habit.target ?? 1);
  const id = `${habit.id}:${date}`;
  await db.habitLogs.put({ id, habitId: habit.id, date, value, done: done || min, min: min && !done ? true : undefined });
  const ref = `habit:${id}`;
  await revoke(ref);
  if (done || min) {
    const streak = await habitStreak(habit.id, date);
    const xp = Math.round(habit.xp * streakMultiplier(streak) * (done ? 1 : MIN_VERSION_SHARE));
    await award('habit', ref, xp, `${habit.name}${done ? '' : ' (min)'}${streak >= 7 ? ` (streak ${streak})` : ''}`, habit.intrinsic ? 0 : coinsFor(xp), date);
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
  return withTargetDefaults((await db.settings.get('workTargets'))?.value as Partial<WorkTargets> | undefined);
}

/** The teaching schedule (empty until the user enters it in Control). */
export async function getTeachingSchedule(): Promise<TeachingSchedule | undefined> {
  return (await db.settings.get('teachingSchedule'))?.value as TeachingSchedule | undefined;
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
  const targets = targetsFor(date, await getWorkTargets(), await getTeachingSchedule());
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
    const full = hours >= targets.done;
    const min = !full && hours >= WORK_MIN_HOURS; // the deep-work minimum version keeps the streak
    await db.habitLogs.put({ id, habitId: workHabit.id, date, value: Math.round(hours * 100) / 100, done: full || min, min: min || undefined });
    const streak = full || min ? await habitStreak(workHabit.id, date) : 0;
    const xp = Math.round(workHabit.xp * streakMultiplier(streak) * (full ? 1 : MIN_VERSION_SHARE));
    await syncAward('habit', `habit:${id}`, full || min ? xp : null, `Deep work ${hours.toFixed(1)} h${min ? ' (min)' : ''}`, coinsFor(xp), date);
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

  await evaluateShieldEarn(date);
  await evaluateWeek(weekStartKey(date));
  await checkAchievements();
}

// ---------- Streak shields (Duolingo-style streak freeze, ledger-based) ----------

/** Shields in the bank: earned minus used (never below 0). */
export async function shieldBank() {
  const earned = await db.xp.where('refId').startsWith('shield:earn:').count();
  const used = await db.xp.where('refId').startsWith('shield:use:').count();
  return Math.max(0, earned - used);
}

/** Good-or-Perfect days in a row ending on `date`. */
async function goodRun(date: string) {
  let n = 0;
  const d = parseKey(date);
  for (;;) {
    const k = dateKey(d);
    const has = await db.xp.where('date').equals(k).filter(e => e.source === 'perfect-day' || e.source === 'good-day').count();
    if (!has) return n;
    n++; d.setDate(d.getDate() - 1);
  }
}

/** Every SHIELD_EVERY Good-or-Perfect days in a row earn a shield (bank holds SHIELD_MAX). Re-evaluated with the day. */
async function evaluateShieldEarn(date: string) {
  const ref = `shield:earn:${date}`;
  const has = (await db.xp.where('refId').equals(ref).count()) > 0;
  const run = await goodRun(date);
  const earns = run > 0 && run % SHIELD_EVERY === 0;
  if (earns && !has && (await shieldBank()) < SHIELD_MAX) {
    await db.xp.add({ id: uid(), ts: Date.now(), date, source: 'shield', refId: ref, xp: 0, coins: 0, label: `Streak shield earned (${run} good days in a row)` });
  } else if (!earns && has) await revoke(ref);
}

/**
 * Run when the app opens: for each core habit missed yesterday whose streak was alive the day before,
 * spend a shield so one missed day doesn't reset it ("never miss twice"). Returns the habits it protected.
 */
export async function applyShields(today = dateKey()) {
  const y = parseKey(today); y.setDate(y.getDate() - 1);
  const yesterday = dateKey(y);
  const before = new Date(y); before.setDate(before.getDate() - 1);
  const protectedHabits: string[] = [];
  // In routine order, so the habits that come first in the day are protected first.
  for (const h of (await db.habits.orderBy('order').toArray()).filter(x => x.core && !x.archived)) {
    if ((await db.habitLogs.get(`${h.id}:${yesterday}`))?.done) continue;
    const ref = `shield:use:${h.id}:${yesterday}`;
    if (await db.xp.where('refId').equals(ref).count()) continue;
    if ((await habitStreak(h.id, dateKey(before))) < 1) continue;
    if ((await shieldBank()) < 1) break;
    await db.xp.add({ id: uid(), ts: Date.now(), date: yesterday, source: 'shield', refId: ref, xp: 0, coins: 0, label: `Streak shield used: ${h.name}` });
    protectedHabits.push(h.name);
  }
  return protectedHabits;
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
  /** Credit-card expenses: meses sin intereses (null or < 2 = a normal purchase). Undefined = leave as is. */
  msiMonths?: number | null;
  /** Income: how it's taxed. Undefined = leave as is, null = remove. */
  incomeTax?: IncomeTax | null;
  /** Expense: creditable IVA. Undefined = leave as is. */
  ivaCreditable?: number;
}

/**
 * Edits a transaction in place. The kind can't change, and XP never changes: the award was for the act
 * of logging, so its `tx:<id>` refId is kept. Transfers update both legs together, keeping their ids.
 */
export async function editTransaction(tx: Transaction, e: TxEdit) {
  const n = Math.abs(e.amount);
  if (!n) return;
  const legsBefore = tx.transferId ? await db.transactions.where('transferId').equals(tx.transferId).toArray() : [];
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
        areaId: e.areaId, // income: who earned it; expense: which activity it's a cost of (E-10)
        incomeTax: tx.kind === 'income' ? (e.incomeTax === undefined ? tx.incomeTax : e.incomeTax ?? undefined) : undefined,
        ivaCreditable: tx.kind === 'expense' ? (e.ivaCreditable === undefined ? tx.ivaCreditable : e.ivaCreditable || undefined) : undefined
      });
    }
  });
  if (tx.kind === 'expense') {
    const updated = (await db.transactions.get(tx.id))!;
    const months = e.msiMonths !== undefined ? e.msiMonths : tx.installmentId ? (await db.installments.get(tx.installmentId))?.months ?? null : null;
    await setInstallments(updated, months);
  }
  // Payments and purchases move statement balances: re-check every card this edit touched.
  const touched = new Set([tx.accountId, e.accountId, e.toAccountId, ...legsBefore.map(t => t.accountId)].filter(Boolean) as string[]);
  if (tx.transferId) (await db.transactions.where('transferId').equals(tx.transferId).toArray()).forEach(t => touched.add(t.accountId));
  for (const id of touched) await evaluateStatements(id);
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
  for (const t of legs) await revoke(`save:${t.id}`);
  for (const t of legs) if (t.installmentId) await db.installments.delete(t.installmentId);
  for (const t of legs) await evaluateStatements(t.accountId);
  await checkAchievements();
}

// ---------- Transfers and savings deposits (v6) ----------
/** Savings deposits (into a shield or invest account) pay at most this many times a month. */
export const SAVE_DEPOSITS_PER_MONTH = 4;

/**
 * Moves money between two accounts (two legs, one transferId). A card payment re-checks that card's statements;
 * a deposit into the shield or investments pays the savings XP (max 4 a month: the habit, not the amount).
 */
export async function transfer(fromId: string, toId: string, amount: number, date: string, description?: string) {
  const n = Math.abs(amount);
  if (!n || fromId === toId) return null;
  const toAcc = await db.accounts.get(toId);
  const ids: [string, string] = [uid(), uid()];
  await db.transactions.bulkAdd(transferLegs({ fromId, toId, amount: n, date, description, isCardPayment: toAcc?.type === 'credit', transferId: uid(), ids, createdAt: Date.now() }));
  await rewardTransactionLogged(ids[0]);
  if (toAcc?.role === 'shield' || toAcc?.role === 'invest') {
    const month = date.slice(0, 7);
    const done = await db.xp.where('source').equals('finance').filter(e => e.refId.startsWith('save:') && e.date.startsWith(month)).count();
    if (done < SAVE_DEPOSITS_PER_MONTH) await award('finance', `save:${ids[0]}`, FINANCE_XP.saveDeposit, `Saved into ${toAcc.name}`, coinsFor(FINANCE_XP.saveDeposit), date);
  }
  if (toAcc?.type === 'credit') await evaluateStatements(toId);
  await checkAchievements();
  return ids;
}

// ---------- RESICO quests (v6) ----------
export async function getTaxProfile(): Promise<TaxProfile> {
  return { ...DEFAULT_TAX_PROFILE, ...((await db.settings.get('taxProfile'))?.value as Partial<TaxProfile> | undefined) };
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Creates the RESICO filing quests once each: last month's declaration (due the 17th; RESICO files even with zero
 * income) and, in April, last year's annual return. Deterministic ids, never overwritten.
 */
async function taxArea() {
  const areas = await db.areas.toArray();
  return areas.find(a => a.short === 'Wealth') ?? areas[areas.length - 1];
}

async function taxNotes(month: string) {
  const m = monthTax(await db.transactions.where('date').startsWith(month).toArray(), month);
  return `Estimate: ISR ${mxn(m.isrDue, 2)} + IVA ${mxn(m.ivaDue, 2)} = ${mxn(m.totalDue, 2)} (income collected ${mxn(m.base, 2)} at ${(m.rate * 100).toFixed(2)} %). File even if it's zero. Pay from the tax reserve.`;
}

/** The monthly declaration quest for `month` (YYYY-MM): due the 17th of the next month, part of the monthly series. */
export async function taxMonthQuest(month: string, areaId: string): Promise<Task> {
  const [y, mo] = month.split('-').map(Number);
  return {
    id: `tax-m-${month}`, areaId, difficulty: 2, priority: 2, status: 'todo', createdAt: Date.now(), dueDate: monthlyDueDate(month),
    title: `Declaración mensual RESICO · ${MONTHS_ES[mo - 1]} ${y}`, autoNotes: await taxNotes(month), recurrence: { ...TAX_MONTHLY_RECURRENCE }
  };
}

export async function ensureTaxQuests(today = dateKey()) {
  const profile = await getTaxProfile();
  if (profile.regime !== 'resico') return;
  const area = await taxArea();
  if (!area) return;
  const t = parseKey(today);
  const prev = dateKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7);
  if (!(await db.tasks.get(`tax-m-${prev}`))) await db.tasks.add(await taxMonthQuest(prev, area.id));
  // The series can create a month's quest before the month ends: keep open estimates in step with the ledger.
  // Only `autoNotes` is rewritten; the user's own `notes` are never touched.
  for (const q of await db.tasks.where('status').notEqual('done').filter(x => x.id.startsWith('tax-m-')).toArray()) {
    const autoNotes = await taxNotes(q.id.slice(6));
    if (q.autoNotes !== autoNotes) await db.tasks.update(q.id, { autoNotes });
  }
  if (t.getMonth() === 3) {
    const year = t.getFullYear() - 1;
    const aid = `tax-a-${year}`;
    if (!(await db.tasks.get(aid))) {
      await db.tasks.add({ id: aid, areaId: area.id, difficulty: 3, priority: 2, status: 'todo', createdAt: Date.now(), dueDate: `${year + 1}-04-30`,
        title: `Declaración anual ${year} (RESICO)`, autoNotes: 'Annual return for personas físicas, due in April. RESICO has no personal deductions.' });
    }
  }
}

// ---------- Credit-card statements (v4) ----------

/**
 * The card reward follows the statement: +50 once per statement when the pago para no generar intereses
 * was paid by the due date. Idempotent; call after any change to statements or card transactions.
 */
export async function evaluateStatements(accountId?: string) {
  const statements = accountId ? await db.statements.where('accountId').equals(accountId).toArray() : await db.statements.toArray();
  for (const st of statements) {
    const acc = await db.accounts.get(st.accountId);
    if (!acc) continue;
    const txs = await db.transactions.where('accountId').equals(acc.id).toArray();
    const status = statementStatus(acc, txs, st);
    await syncAward('finance', `stmt:${st.id}`, status.state === 'paid' ? FINANCE_XP.payCardInFull : null,
      `Paid ${acc.name} statement (pago para no generar intereses)`, coinsFor(FINANCE_XP.payCardInFull), st.dueDate > dateKey() ? dateKey() : st.dueDate);
  }
  await checkAchievements();
}

export async function saveStatement(st: Statement) {
  await db.statements.put(st);
  await evaluateStatements(st.accountId);
}

export async function deleteStatement(st: Statement) {
  await db.statements.delete(st.id);
  await revoke(`stmt:${st.id}`);
  await checkAchievements();
}

/** Turns a card purchase into an MSI plan: each statement from the purchase's cut-off bills total / months. */
export async function setInstallments(tx: Transaction, months: number | null) {
  const existing = tx.installmentId ? await db.installments.get(tx.installmentId) : undefined;
  if (!months || months < 2) {
    if (existing) await db.installments.delete(existing.id);
    if (tx.installmentId) await db.transactions.update(tx.id, { installmentId: undefined });
    return;
  }
  const acc = await db.accounts.get(tx.accountId);
  if (!acc || acc.type !== 'credit' || !acc.cutoffDay) return;
  const id = existing?.id ?? uid();
  await db.installments.put({
    id, accountId: acc.id, description: tx.description || tx.category, total: Math.abs(tx.amount), months,
    firstCutoff: cutoffOnOrAfter(acc.cutoffDay, tx.date), txId: tx.id, createdAt: existing?.createdAt ?? Date.now()
  });
  if (tx.installmentId !== id) await db.transactions.update(tx.id, { installmentId: id });
}

// ---------- Income engine: leading indicators (v7) ----------
const LEAD_LABEL: Record<PipelineEventKind, string> = { conversation: 'Conversation', proposal: 'Proposal sent', 'case-study': 'Case study published', stage: 'Pipeline moved' };

/** Logs a conversation, proposal or case study (one tap). Conversations pay at most 45 XP a day. */
export async function logPipelineEvent(kind: Exclude<PipelineEventKind, 'stage'>, opts: { opportunityId?: string; note?: string; date?: string } = {}) {
  const id = uid();
  const date = opts.date ?? dateKey();
  await db.pipelineEvents.add({ id, kind, opportunityId: opts.opportunityId, note: opts.note, date, createdAt: Date.now() });
  let xp: number = LEAD_XP[kind];
  if (kind === 'conversation') {
    const today = (await db.xp.where('date').equals(date).filter(e => e.source === 'pipeline' && e.refId.startsWith('pipe:') && e.label.startsWith(LEAD_LABEL.conversation)).toArray()).reduce((s, e) => s + e.xp, 0);
    xp = Math.max(0, Math.min(xp, CONVERSATION_DAILY_CAP_XP - today));
  }
  if (xp > 0) await award('pipeline', `pipe:${id}`, xp, `${LEAD_LABEL[kind]}${opts.note ? `: ${opts.note}` : ''}`, coinsFor(xp), date);
  await checkAchievements();
  return id;
}

export async function deletePipelineEvent(id: string) {
  await db.pipelineEvents.delete(id);
  await revoke(`pipe:${id}`);
  await checkAchievements();
}

/** Saves an opportunity; moving it to a new stage pays once per opportunity and stage (lost included: closing loops counts). */
export async function saveOpportunity(o: Opportunity) {
  const before = await db.opportunities.get(o.id);
  await db.opportunities.put(o);
  if (before && before.status !== o.status) {
    await db.pipelineEvents.add({ id: uid(), kind: 'stage', opportunityId: o.id, date: dateKey(), note: `${before.status} → ${o.status}`, createdAt: Date.now() });
    await awardOnce('pipeline', `pipe:stage:${o.id}:${o.status}`, LEAD_XP.stage, `${LEAD_LABEL.stage}: ${o.title} → ${o.status}`);
  }
  await checkAchievements();
}

export async function deleteOpportunity(o: Opportunity) {
  await db.opportunities.delete(o.id);
  await db.xp.where('refId').startsWith(`pipe:stage:${o.id}:`).delete();
  await checkAchievements();
}

/** True when a lead's next action date has passed (and it's still open). */
export const isStale = (o: Opportunity, today = dateKey()) => o.status !== 'won' && o.status !== 'lost' && !!o.nextActionDate && o.nextActionDate < today;

// ---------- Weekly review (P1-4) ----------
export interface ReviewInput {
  /** Monday of the reviewed week */
  monday: string;
  wins: string[];
  /** Existing quests chosen for next week */
  questIds: string[];
  /** New quests typed in the review: created as "This week" quests in `areaId` */
  newQuests?: { title: string; areaId: string }[];
  note?: string;
}

/**
 * Saves the review of a Mon–Sun week. A complete review (3 wins, 3 quests) of the current review week pays REVIEW_XP
 * once (`review:<monday>`); editing never pays again, and making it incomplete takes the XP back.
 * Next week's quests become "This week" quests due on next week's Sunday.
 */
export async function saveReview(r: ReviewInput, today = dateKey()) {
  const end = parseKey(r.monday); end.setDate(end.getDate() + 6);
  const weekEnd = dateKey(end);
  const nextSunday = parseKey(r.monday); nextSunday.setDate(nextSunday.getDate() + 13);
  const due = dateKey(nextSunday);
  const ids = [...r.questIds];
  for (const q of r.newQuests ?? []) {
    if (!q.title.trim()) continue;
    const id = uid();
    await db.tasks.add({ id, areaId: q.areaId, title: q.title.trim(), difficulty: 3, priority: 2, dueDate: due, status: 'todo', createdAt: Date.now() });
    ids.push(id);
  }
  // A quest chosen from "Someday" moves up to "This week": it's one of the week's three.
  for (const id of r.questIds) {
    const t = await db.tasks.get(id);
    if (t && t.priority === 3) await db.tasks.update(id, { priority: 2 });
  }
  const before = await db.reviews.get(r.monday);
  const wins = r.wins.map(w => w.trim());
  await db.reviews.put({ id: r.monday, weekEnd, wins, nextQuestIds: ids, note: r.note?.trim() || undefined, createdAt: before?.createdAt ?? Date.now(), updatedAt: Date.now() });
  const ref = `review:${r.monday}`;
  if (!reviewComplete(wins, ids)) await revoke(ref);
  else if (r.monday === reviewWeekFor(today)) await awardOnce('review', ref, REVIEW_XP, `Weekly review (${r.monday.slice(5)} to ${weekEnd.slice(5)})`, coinsFor(REVIEW_XP), today);
  return ids;
}

export async function deleteReview(monday: string) {
  await db.reviews.delete(monday);
  await revoke(`review:${monday}`);
}

// ---------- Rewards ----------
/** Spends coins on a reward. Returns the ledger refId (for undo), or null if there aren't enough coins. */
export async function redeem(rewardId: string) {
  const r = await db.rewards.get(rewardId);
  if (!r) return null;
  const { coins } = await totals();
  if (coins < r.cost) return null;
  const refId = `reward:${rewardId}:${Date.now()}`;
  await db.xp.add({ id: uid(), ts: Date.now(), date: dateKey(), source: 'reward', refId, xp: 0, coins: -r.cost, label: `Redeemed: ${r.title}` });
  return refId;
}

/** Undoes a purchase made by mistake (the Agora offers it for a short while after buying). */
export async function undoRedeem(refId: string) {
  if (!refId.startsWith('reward:')) return;
  await revoke(refId);
}
