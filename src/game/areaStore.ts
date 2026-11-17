// Q-3: the area editor's writes. Every write goes through Dexie, so sync records it (src/sync/track.ts).
// The rules live in areaEdit.ts; these functions check them again so no screen can bypass them.
import { db, getSetting } from '@/db/db';
import type { Area } from '@/db/types';
import { uid } from '@/lib/util';
import { areaChanges, areaDraftError, moveArea, newArea, type AreaDraft } from './areaEdit';

const others = async (id?: string) => (await db.areas.toArray()).filter(a => a.id !== id);

/** Adds an area. Its id is random, so two devices adding areas never collide. */
export async function addArea(d: AreaDraft) {
  const all = await db.areas.toArray();
  const err = areaDraftError(d, all);
  if (err) throw new Error(err);
  const a = newArea(uid(), d, all);
  await db.areas.add(a);
  return a;
}

/** Saves the changed fields of a draft. Writes nothing when nothing changed. */
export async function saveArea(a: Area, d: AreaDraft) {
  const err = areaDraftError(d, await others(a.id));
  if (err) throw new Error(err);
  const changes = areaChanges(a, d);
  if (Object.keys(changes).length) await db.areas.update(a.id, changes);
  return changes;
}

/** Moves an area one step among the active ones (the order of tiles on Quests, menus and charts). */
export async function moveAreaStep(group: Area[], id: string, dir: -1 | 1) {
  const moves = moveArea(group, id, dir);
  if (!moves.length) return;
  await db.transaction('rw', db.areas, async () => { for (const m of moves) await db.areas.update(m.id, { order: m.order }); });
}

/** Archives or restores an area. Its quests, hours and money stay; an archived area leaves menus, tiles and targets. */
export async function setAreaArchived(a: Area, archived: boolean) {
  if (archived) {
    if (!(await others(a.id)).some(x => !x.archived)) throw new Error('Keep at least one area: quests need somewhere to live.');
  }
  if (a.archived !== archived) await db.areas.update(a.id, { archived });
}

/** How many rows point at an area. Anything above zero means archive, not delete. */
export async function areaUsage(areaId: string) {
  const [quests, openQuests, sessions, transactions, hours, opportunities, invoices, schedule, timer] = await Promise.all([
    db.tasks.where('areaId').equals(areaId).count(),
    db.tasks.where('areaId').equals(areaId).filter(t => t.status !== 'done').count(),
    db.sessions.where('areaId').equals(areaId).count(),
    db.transactions.where('areaId').equals(areaId).count(),
    db.areaHours.where('areaId').equals(areaId).count(),
    db.opportunities.filter(o => o.areaId === areaId).count(),
    db.invoices.filter(i => i.areaId === areaId).count(),
    getSetting<{ areaId?: string } | null>('teachingSchedule', null),
    getSetting<{ areaId?: string } | null>('activeTimer', null)
  ]);
  // The teaching schedule and a running focus timer point at an area too, without a row of their own.
  const pointers = (schedule?.areaId === areaId ? 1 : 0) + (timer?.areaId === areaId ? 1 : 0);
  return { quests, openQuests, total: quests + sessions + transactions + hours + opportunities + invoices + pointers };
}

/** Deletes an area only while nothing points at it (otherwise archive it). */
export async function deleteArea(a: Area) {
  return db.transaction('rw', [db.areas, db.tasks, db.sessions, db.transactions, db.areaHours, db.opportunities, db.invoices, db.settings], async () => {
    if ((await areaUsage(a.id)).total > 0) return false;
    if (!a.archived && !(await others(a.id)).some(x => !x.archived)) throw new Error('Keep at least one area: quests need somewhere to live.');
    await db.areas.delete(a.id);
    return true;
  });
}
