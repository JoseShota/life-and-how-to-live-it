// P1-3 habit editor: the pure rules (src/game/habitEdit.ts), the writes (src/game/habitStore.ts) and sync.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import type { Habit } from '../src/db/types';
import { blankDraft, draftError, draftOf, editableFields, habitChanges, moveHabit, newHabit, xpChoicesFor, byOrder } from '../src/game/habitEdit';
import { addHabit, deleteHabit, moveHabitStep, saveHabit, setHabitArchived } from '../src/game/habitStore';
import { setHabit, evaluateDay } from '../src/game/engine';
import { RITUAL_XP_CHOICES, NEW_RITUAL_XP } from '../src/game/rules';
import { FakeServer } from './helpers/fakeServer';
import { device, settle, PASS } from './helpers/devices';

const habit = (extra: Partial<Habit> = {}): Habit =>
  ({ id: 'h1', key: 'wake', name: 'Up by 5:45', icon: 'sunrise', kind: 'check', xp: 20, core: false, order: 0, archived: false, ...extra });

describe('habit editor rules (pure)', () => {
  it('core habits: name, icon, plan and minimum only; rituals also XP, dr and archive; delete only for added habits', () => {
    expect(editableFields(habit({ core: true }))).toMatchObject({ name: true, icon: true, plan: true, minLabel: true, xp: false, intrinsic: false, archive: false, delete: false });
    expect(editableFields(habit({ key: 'work', core: true, kind: 'auto' })).minLabel).toBe(false);
    expect(editableFields(habit())).toMatchObject({ xp: true, intrinsic: true, archive: true, delete: false });
    expect(editableFields(habit({ key: 'custom-x' })).delete).toBe(true);
  });

  it('only allowed, changed fields are written; empty texts are removed', () => {
    const core = habit({ core: true, xp: 25, plan: 'When I wake, I will run' });
    expect(habitChanges(core, draftOf(core))).toEqual({});
    expect(habitChanges(core, { ...draftOf(core), xp: 5, intrinsic: true })).toEqual({});
    expect(habitChanges(core, { ...draftOf(core), name: '  Run  ', plan: ' ' })).toEqual({ name: 'Run', plan: undefined });
    const ritual = habit();
    expect(habitChanges(ritual, { ...draftOf(ritual), xp: 10, intrinsic: true, minLabel: ' 6:15 ' })).toEqual({ xp: 10, intrinsic: true, minLabel: '6:15' });
    expect(habitChanges({ ...ritual, intrinsic: true }, { ...draftOf(ritual), intrinsic: false })).toEqual({ intrinsic: undefined });
  });

  it('a draft needs a name, and a ritual XP from the choices; a core XP outside them is fine while unchanged', () => {
    expect(draftError(habit(), { ...draftOf(habit()), name: ' ' })).toMatch(/name/);
    expect(draftError(habit(), { ...draftOf(habit()), xp: 30 })).toMatch(/XP/);
    expect(draftError(habit({ core: true, xp: 40 }), draftOf(habit({ core: true, xp: 40 })))).toBeNull();
    expect(draftError(habit(), { ...draftOf(habit()), name: 'x'.repeat(61) })).toMatch(/60/);
    expect(xpChoicesFor(habit({ xp: 25 }))).toEqual([...RITUAL_XP_CHOICES, 25]);
    expect(xpChoicesFor(habit({ xp: 10 }))).toEqual(RITUAL_XP_CHOICES);
  });

  it('a new habit is a tick-box ritual with a key of its own, after every other habit', () => {
    const h = newHabit('abc', { ...blankDraft(), name: ' Read ', xp: 99 }, [{ order: 3 }, { order: 7 }]);
    expect(h).toMatchObject({ id: 'abc', key: 'custom-abc', name: 'Read', kind: 'check', core: false, xp: NEW_RITUAL_XP, order: 8, archived: false });
  });

  it('moving swaps two positions and writes only those two; ties are renumbered; the ends do nothing', () => {
    const g = [habit({ id: 'a', order: 1, name: 'A' }), habit({ id: 'b', order: 2, name: 'B' }), habit({ id: 'c', order: 5, name: 'C' })];
    expect(moveHabit(g, 'c', -1)).toEqual([{ id: 'c', order: 2 }, { id: 'b', order: 5 }]);
    expect(moveHabit(g, 'a', -1)).toEqual([]);
    expect(moveHabit(g, 'c', 1)).toEqual([]);
    const tied = [habit({ id: 'a', order: 4, name: 'A' }), habit({ id: 'b', order: 4, name: 'B' }), habit({ id: 'c', order: 4, name: 'C' })];
    expect(moveHabit(tied, 'c', -1)).toEqual([{ id: 'c', order: 5 }, { id: 'b', order: 6 }]);
    expect([habit({ id: 'b', order: 1, name: 'B' }), habit({ id: 'a', order: 1, name: 'A' })].sort(byOrder).map(h => h.id)).toEqual(['a', 'b']);
  });
});

describe('habit editor writes', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  const by = async (k: string) => (await db.habits.where('key').equals(k).first())!;

  it('adds a ritual that shows last and can be checked like any habit', async () => {
    const h = await addHabit({ ...blankDraft(), name: 'Read 10 pages', icon: 'scroll', xp: 15 });
    const all = (await db.habits.toArray()).sort(byOrder);
    expect(all.at(-1)!.id).toBe(h.id);
    await setHabit(h, '2026-11-09', 1);
    expect((await db.xp.get(`habit:${h.id}:2026-11-09`))?.xp).toBe(15);
    await expect(addHabit({ ...blankDraft(), name: '' })).rejects.toThrow();
  });

  it('saving an unchanged habit writes nothing, so nothing syncs', async () => {
    const wake = await by('wake');
    await db.syncOutbox.clear();
    expect(await saveHabit(wake, draftOf(wake))).toEqual({});
    expect(await db.syncOutbox.count()).toBe(0);
    await saveHabit(wake, { ...draftOf(wake), name: 'Up early' });
    expect((await db.syncOutbox.toArray()).map(o => o.id)).toEqual([`habits|${wake.id}`]);
  });

  it('a core habit keeps its XP; a ritual XP change applies from the next check-off and earned XP stays', async () => {
    const ex = await by('exercise');
    await saveHabit(ex, { ...draftOf(ex), name: 'Move', xp: 5 });
    expect(await by('exercise')).toMatchObject({ name: 'Move', xp: ex.xp, core: true });
    const wake = await by('wake');
    await setHabit(wake, '2026-11-02', 1);
    await saveHabit(wake, { ...draftOf(wake), xp: 5 });
    await setHabit(await by('wake'), '2026-11-04', 1);
    expect((await db.xp.get(`habit:${wake.id}:2026-11-02`))?.xp).toBe(wake.xp);
    expect((await db.xp.get(`habit:${wake.id}:2026-11-04`))?.xp).toBe(5);
  });

  it('core habits cannot be archived; an archived ritual keeps its history and does not change the day grade', async () => {
    await expect(setHabitArchived(await by('sleep'), true)).rejects.toThrow();
    const clean = await by('clean');
    await setHabit(clean, '2026-11-03', 1);
    for (const k of ['sleep', 'exercise', 'money']) await setHabit(await by(k), '2026-11-03', k === 'sleep' ? 8 : 1);
    const good = await db.xp.get('good:2026-11-03');
    await setHabitArchived(clean, true);
    await evaluateDay('2026-11-03');
    expect(await db.xp.get('good:2026-11-03')).toEqual(good);
    expect(await db.habitLogs.get(`${clean.id}:2026-11-03`)).toBeTruthy();
    expect(await db.xp.get(`habit:${clean.id}:2026-11-03`)).toBeTruthy();
    await setHabitArchived(await by('clean'), false);
    expect((await by('clean')).archived).toBe(false);
  });

  it('only a habit you added, never checked, can be deleted', async () => {
    await expect(deleteHabit(await by('clean'))).rejects.toThrow();
    const a = await addHabit({ ...blankDraft(), name: 'Stretch' });
    const b = await addHabit({ ...blankDraft(), name: 'Journal' });
    await setHabit(b, '2026-11-05', 1);
    expect(await deleteHabit(a)).toBe(true);
    expect(await deleteHabit(b)).toBe(false);
    expect(await db.habits.get(a.id)).toBeUndefined();
    expect(await db.habits.get(b.id)).toBeTruthy();
  });

  it('reordering writes only the habits that moved', async () => {
    const core = (await db.habits.toArray()).filter(h => h.core && !h.archived).sort(byOrder);
    await db.syncOutbox.clear();
    await moveHabitStep(core, core[3].id, -1);
    const after = (await db.habits.toArray()).filter(h => h.core).sort(byOrder).map(h => h.id);
    expect(after).toEqual([core[0].id, core[1].id, core[3].id, core[2].id]);
    expect((await db.syncOutbox.toArray()).map(o => o.id).sort()).toEqual([`habits|${core[2].id}`, `habits|${core[3].id}`].sort());
  });
});

describe('habit editor and sync', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('rituals added on both devices at once both survive; an edit and a reorder reach the other device', async () => {
    const server = new FakeServer();
    const a = await device(server.client());
    const b = await device(server.client());
    await a.sync.createCloud(PASS, 1000);
    expect(await b.sync.joinCloud(PASS)).toBe(true);
    await a.db.habits.add(newHabit('ida', { ...blankDraft(), name: 'Stretch' }, await a.db.habits.toArray()));
    await b.db.habits.add(newHabit('idb', { ...blankDraft(), name: 'Journal' }, await b.db.habits.toArray()));
    await settle(a, b);
    for (const d of [a, b]) expect((await d.db.habits.bulkGet(['ida', 'idb'])).map(h => h?.name)).toEqual(['Stretch', 'Journal']);
    const wake = (await a.db.habits.where('key').equals('wake').first())!;
    await a.db.habits.update(wake.id, habitChanges(wake, { ...draftOf(wake), name: 'Up early', xp: 10 }));
    const rituals = (await b.db.habits.toArray()).filter(h => !h.core).sort(byOrder);
    for (const m of moveHabit(rituals, rituals.at(-1)!.id, -1)) await b.db.habits.update(m.id, { order: m.order });
    await settle(a, b);
    expect(await b.db.habits.get(wake.id)).toMatchObject({ name: 'Up early', xp: 10 });
    expect(await a.snapshot()).toEqual(await b.snapshot());
  });
});
