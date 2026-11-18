// Habit streaks and streak shields: the part of the engine that runs at startup (applyShields), kept apart from
// engine.ts so the entry chunk doesn't carry the whole engine, achievements and finance (P1-9 bundle budget).
import { db } from '@/db/db';
import { dateKey, parseKey } from '@/lib/util';

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

/** Shields in the bank: earned minus used (never below 0). */
export async function shieldBank() {
  const earned = await db.xp.where('refId').startsWith('shield:earn:').count();
  const used = await db.xp.where('refId').startsWith('shield:use:').count();
  return Math.max(0, earned - used);
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
    await db.xp.put({ id: ref, ts: Date.now(), date: yesterday, source: 'shield', refId: ref, xp: 0, coins: 0, label: `Streak shield used: ${h.name}` });
    protectedHabits.push(h.name);
  }
  return protectedHabits;
}
