// P1-3: the habit editor's writes. Every write goes through Dexie, so sync records it (src/sync/track.ts).
// The rules (what may change) live in habitEdit.ts; these functions enforce them again so no screen can bypass them.
// Changing a habit's XP or coins applies from its next check-off: XP already earned stays in the ledger as it was.
import { db } from '@/db/db';
import type { Habit } from '@/db/types';
import { uid } from '@/lib/util';
import { draftError, editableFields, habitChanges, moveHabit, newHabit, type HabitDraft } from './habitEdit';
import { NEW_RITUAL_XP } from './rules';

/** What a habit that doesn't exist yet allows: a ritual's fields (draftError checks its XP against the choices). */
export const NEW_HABIT_BASE = { core: false, kind: 'check', key: 'custom-', xp: NEW_RITUAL_XP } as const;

/** Adds a ritual. Its id is random, so two devices adding habits never collide. */
export async function addHabit(d: HabitDraft) {
  const err = draftError(NEW_HABIT_BASE, d);
  if (err) throw new Error(err);
  const h = newHabit(uid(), d, await db.habits.toArray());
  await db.habits.add(h);
  return h;
}

/** Saves the allowed, changed fields of a draft. Writes nothing when nothing changed. */
export async function saveHabit(h: Habit, d: HabitDraft) {
  const err = draftError(h, d);
  if (err) throw new Error(err);
  const changes = habitChanges(h, d);
  if (Object.keys(changes).length) await db.habits.update(h.id, changes);
  return changes;
}

/** Moves a habit one step inside its group (core or rituals); only the rows that change are written. */
export async function moveHabitStep(group: Habit[], id: string, dir: -1 | 1) {
  const moves = moveHabit(group, id, dir);
  if (!moves.length) return;
  await db.transaction('rw', db.habits, async () => { for (const m of moves) await db.habits.update(m.id, { order: m.order }); });
}

/** Archives or restores a ritual. Its logs and XP stay; an archived habit is hidden from Today and Stats. */
export async function setHabitArchived(h: Habit, archived: boolean) {
  if (!editableFields(h).archive) throw new Error('Core habits stay: they decide Perfect and Good Days.');
  if (h.archived !== archived) await db.habits.update(h.id, { archived });
}

export const habitHasHistory = async (habitId: string) => (await db.habitLogs.where('habitId').equals(habitId).count()) > 0;

/** Deletes a habit you added, only while it has never been logged (otherwise archive it). */
export async function deleteHabit(h: Habit) {
  if (!editableFields(h).delete) throw new Error('Only a habit you added can be deleted.');
  return db.transaction('rw', db.habits, db.habitLogs, async () => {
    if (await habitHasHistory(h.id)) return false;
    await db.habits.delete(h.id);
    return true;
  });
}
