// Q-3 area editor: the pure rules (src/game/areaEdit.ts) and the writes (src/game/areaStore.ts).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, setSetting } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import type { Area } from '../src/db/types';
import { AREA_COLORS, areaByOrder, areaChanges, areaDraftError, blankAreaDraft, draftOfArea, moveArea, newArea } from '../src/game/areaEdit';
import { addArea, areaUsage, deleteArea, moveAreaStep, saveArea, setAreaArchived } from '../src/game/areaStore';
import { matchArea } from '../src/lib/quickAdd';

const area = (extra: Partial<Area> = {}): Area =>
  ({ id: 'a1', name: 'Freelance web development', short: 'Freelance', icon: 'amphora', color: '#a6d9d1', kind: 'work', weeklyHoursTarget: 10, monetizable: true, order: 0, archived: false, ...extra });

const jobs = () => ({ ...blankAreaDraft(), name: 'Job market', short: 'Jobs', icon: 'scroll' });

describe('area editor rules (pure)', () => {
  it('needs a name, a short name unique among active areas, a palette-shaped color and sane hours', () => {
    expect(areaDraftError(jobs())).toBeNull();
    expect(areaDraftError({ ...jobs(), name: ' ' })).toMatch(/name/);
    expect(areaDraftError({ ...jobs(), short: '' })).toMatch(/short name/);
    expect(areaDraftError({ ...jobs(), short: 'x'.repeat(13) })).toMatch(/under 12/);
    expect(areaDraftError({ ...jobs(), short: 'jobs ' }, [{ short: 'Jobs', archived: false }])).toMatch(/already/);
    expect(areaDraftError({ ...jobs(), short: 'Jobs' }, [{ short: 'Jobs', archived: true }])).toBeNull();
    expect(areaDraftError({ ...jobs(), weeklyHoursTarget: NaN })).toMatch(/Weekly hours/);
    expect(areaDraftError({ ...jobs(), weeklyHoursTarget: -1 })).toMatch(/Weekly hours/);
    expect(areaDraftError({ ...jobs(), color: 'red' })).toMatch(/color/);
  });

  it('a new area takes the first color no active area uses', () => {
    expect(blankAreaDraft([]).color).toBe(AREA_COLORS[0]);
    expect(blankAreaDraft([{ color: AREA_COLORS[0].toUpperCase(), archived: false }]).color).toBe(AREA_COLORS[1]);
    expect(blankAreaDraft([{ color: AREA_COLORS[0], archived: true }]).color).toBe(AREA_COLORS[0]);
  });

  it('only changed fields are written; texts are trimmed', () => {
    const a = area();
    expect(areaChanges(a, draftOfArea(a))).toEqual({});
    expect(areaChanges(a, { ...draftOfArea(a), name: '  Freelance  ', short: 'Free ', kind: 'growth', monetizable: false }))
      .toEqual({ name: 'Freelance', short: 'Free', kind: 'growth', monetizable: false });
  });

  it('a new area goes after every other one; moves swap two rows', () => {
    expect(newArea('n', jobs(), [{ order: 3 }, { order: 7 }]).order).toBe(8);
    const list = [area({ id: 'a', order: 0 }), area({ id: 'b', order: 1, name: 'B' }), area({ id: 'c', order: 2, name: 'C' })];
    expect(moveArea(list, 'c', -1)).toEqual([{ id: 'c', order: 1 }, { id: 'b', order: 2 }]);
    expect(moveArea(list, 'a', -1)).toEqual([]);
  });
});

describe('area editor writes', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });

  it('adds Job market last, and quick capture finds it by #jobs', async () => {
    const a = await addArea(jobs());
    const all = (await db.areas.toArray()).sort(areaByOrder);
    expect(all.at(-1)!.id).toBe(a.id);
    expect(a).toMatchObject({ name: 'Job market', short: 'Jobs', kind: 'growth', monetizable: false, archived: false });
    expect(matchArea('jobs', all)?.id).toBe(a.id);
    await expect(addArea({ ...jobs(), name: 'Other', short: 'JOBS' })).rejects.toThrow(/already/);
  });

  it('saves edits, and a reorder writes only the two swapped rows', async () => {
    const a = await addArea(jobs());
    expect(await saveArea(a, { ...draftOfArea(a), kind: 'work', weeklyHoursTarget: 5 })).toEqual({ kind: 'work', weeklyHoursTarget: 5 });
    expect(await db.areas.get(a.id)).toMatchObject({ kind: 'work', weeklyHoursTarget: 5 });
    const active = (await db.areas.toArray()).filter(x => !x.archived).sort(areaByOrder);
    await moveAreaStep(active, a.id, -1);
    const after = (await db.areas.toArray()).sort(areaByOrder);
    expect(after.at(-2)!.id).toBe(a.id);
  });

  it('an unused area can be deleted; one with history is archived instead', async () => {
    const a = await addArea(jobs());
    expect((await areaUsage(a.id)).total).toBe(0);
    expect(await deleteArea(a)).toBe(true);
    expect(await db.areas.get(a.id)).toBeUndefined();

    const b = await addArea(jobs());
    await db.tasks.add({ id: 't1', areaId: b.id, title: 'Update CV', difficulty: 2, priority: 2, status: 'todo', createdAt: 1 });
    expect(await areaUsage(b.id)).toMatchObject({ quests: 1, openQuests: 1, total: 1 });
    expect(await deleteArea(b)).toBe(false);
    await setAreaArchived(b, true);
    expect((await db.areas.get(b.id))!.archived).toBe(true);
    expect(await db.tasks.get('t1')).toBeDefined();
    await setAreaArchived((await db.areas.get(b.id))!, false);
    expect((await db.areas.get(b.id))!.archived).toBe(false);
  });

  it('the teaching schedule and a running timer count as uses', async () => {
    const a = await addArea(jobs());
    await setSetting('activeTimer', { areaId: a.id, start: 1 });
    expect(await deleteArea(a)).toBe(false);
    await setSetting('activeTimer', null);
    await setSetting('teachingSchedule', { areaId: a.id });
    expect(await deleteArea(a)).toBe(false);
  });

  it('the last active area cannot be archived or deleted', async () => {
    const all = await db.areas.toArray();
    for (const a of all.slice(1)) await setAreaArchived(a, true);
    await expect(setAreaArchived(all[0], true)).rejects.toThrow(/at least one/);
  });
});
