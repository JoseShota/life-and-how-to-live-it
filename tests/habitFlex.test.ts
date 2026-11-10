// Flexible logging: any amount on a measured habit, measured rituals you add, and a free note per day.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { blankDraft, draftError, draftOf, editableFields, habitChanges, habitDone, newHabit, parseAmount, formatAmount } from '../src/game/habitEdit';
import { addHabit, saveHabit } from '../src/game/habitStore';
import { setHabit, setHabitNote, logSession, habitStreak } from '../src/game/engine';
import { ACHIEVEMENTS, achievementProgress, checkAchievements, longestRun } from '../src/game/achievements';
import { NEW_RITUAL_XP, coinsFor } from '../src/game/rules';

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await seedIfEmpty();
});

const by = async (k: string) => (await db.habits.where('key').equals(k).first())!;
const D = '2026-11-09', D2 = '2026-11-10';
const xpOf = async (habitId: string, date: string) => (await db.xp.where('refId').equals(`habit:${habitId}:${date}`).first());

describe('amounts as typed', () => {
  it('reads decimals, commas and hours:minutes', () => {
    expect(parseAmount('7.5')).toBe(7.5);
    expect(parseAmount(' 7,25 ')).toBe(7.25);
    expect(parseAmount('7:30')).toBe(7.5);
    expect(parseAmount('6h40')).toBe(6.67);
    expect(parseAmount('8h')).toBe(8);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('12')).toBe(12);
  });
  it('refuses what is not an amount', () => {
    for (const bad of ['', 'abc', '-2', '7:75', '1e3', '7.5.1', '.']) expect(parseAmount(bad)).toBeNull();
  });
  it('prints amounts without noise', () => {
    expect(formatAmount(7)).toBe('7');
    expect(formatAmount(6.6667)).toBe('6.67');
  });
});

describe('done rule', () => {
  it('a tick needs 1, a bar needs the bar, no bar counts from any amount', () => {
    expect(habitDone({ kind: 'check' }, 1)).toBe(true);
    expect(habitDone({ kind: 'check' }, 0)).toBe(false);
    expect(habitDone({ kind: 'number', target: 7.5 }, 7.25)).toBe(false);
    expect(habitDone({ kind: 'number', target: 7.5 }, 7.5)).toBe(true);
    expect(habitDone({ kind: 'number' }, 0.5)).toBe(true);
    expect(habitDone({ kind: 'number' }, 0)).toBe(false);
  });
});

describe('sleep takes any amount', () => {
  it('6 h 40 is logged as it is and is not done; 7 h 45 is', async () => {
    const sleep = await by('sleep');
    await setHabit(sleep, D, parseAmount('6:40')!);
    expect(await db.habitLogs.get(`${sleep.id}:${D}`)).toMatchObject({ value: 6.67, done: false });
    expect(await xpOf(sleep.id, D)).toBeUndefined();
    await setHabit(sleep, D, parseAmount('7h45')!);
    expect(await db.habitLogs.get(`${sleep.id}:${D}`)).toMatchObject({ value: 7.75, done: true });
    expect((await xpOf(sleep.id, D))?.xp).toBe(sleep.xp);
  });
  it('sleep stays fixed: its bar and unit are not editable', async () => {
    const sleep = await by('sleep');
    expect(editableFields(sleep).measure).toBe(false);
    expect(habitChanges(sleep, { ...draftOf(sleep), unit: 'min', target: 5 })).toEqual({});
  });
});

describe('measured rituals', () => {
  it('a new ritual can be an amount, with or without a bar; the XP rules are a ritual\'s', async () => {
    const pages = await addHabit({ ...blankDraft(), name: 'Read', measured: true, unit: ' pages ', target: 20 });
    expect(pages).toMatchObject({ kind: 'number', unit: 'pages', target: 20, core: false, xp: NEW_RITUAL_XP });
    const water = newHabit('w', { ...blankDraft(), name: 'Water', measured: true, unit: 'L' }, []);
    expect(water).toMatchObject({ kind: 'number', unit: 'L' });
    expect(water.target).toBeUndefined();
    // A tick-box draft never carries a unit or a bar.
    expect(newHabit('t', { ...blankDraft(), name: 'Stretch', unit: 'min', target: 5 }, [])).not.toHaveProperty('unit');

    await setHabit(pages, D, 12);
    expect((await db.habitLogs.get(`${pages.id}:${D}`))?.done).toBe(false);
    await setHabit(pages, D, 25);
    expect(await xpOf(pages.id, D)).toMatchObject({ xp: NEW_RITUAL_XP, coins: coinsFor(NEW_RITUAL_XP) });
    expect(await habitStreak(pages.id, D)).toBe(1);
  });
  it('refuses a bar that is not above zero; its unit and bar can change later', async () => {
    expect(draftError({ core: false, kind: 'check', key: 'custom-', xp: 10 }, { ...blankDraft(), name: 'Read', measured: true, target: 0 })).toMatch(/target/);
    expect(draftError({ core: false, kind: 'check', key: 'custom-', xp: 10 }, { ...blankDraft(), name: 'Read', measured: true, target: NaN })).toMatch(/target/);
    const h = await addHabit({ ...blankDraft(), name: 'Walk', measured: true, unit: 'km', target: 3 });
    expect(await saveHabit(h, { ...draftOf(h), unit: 'steps', target: undefined })).toEqual({ unit: 'steps', target: undefined });
    expect((await db.habits.get(h.id))?.target).toBeUndefined();
  });
});

describe('a note for the day', () => {
  it('is kept when the habit is logged, re-logged or unchecked, and pays nothing', async () => {
    const ex = await by('exercise');
    await setHabitNote(ex, D, '  ran 5 km  ');
    expect(await db.habitLogs.get(`${ex.id}:${D}`)).toMatchObject({ note: 'ran 5 km', done: false, value: 0 });
    expect(await db.xp.count()).toBe(0);
    await setHabit(ex, D, 1);
    expect(await db.habitLogs.get(`${ex.id}:${D}`)).toMatchObject({ note: 'ran 5 km', done: true });
    await setHabit(ex, D, 0);
    expect((await db.habitLogs.get(`${ex.id}:${D}`))?.note).toBe('ran 5 km');
    await setHabitNote(ex, D, '');
    expect((await db.habitLogs.get(`${ex.id}:${D}`))?.note).toBeUndefined();
  });
  it('an empty note on a day with no log writes nothing; the deep-work log keeps its note', async () => {
    const ex = await by('exercise'), work = await by('work');
    await setHabitNote(ex, D2, '   ');
    expect(await db.habitLogs.get(`${ex.id}:${D2}`)).toBeUndefined();
    await setHabitNote(work, D2, 'proposal for the retainer');
    const area = (await db.areas.toArray())[0];
    await logSession(area.id, new Date(2026, 10, 10, 9).getTime(), new Date(2026, 10, 10, 11).getTime());
    expect(await db.habitLogs.get(`${work.id}:${D2}`)).toMatchObject({ value: 2, note: 'proposal for the retainer' });
  });
});

describe('achievement progress', () => {
  it('covers every achievement, and unlocking follows the same numbers', async () => {
    const p = await achievementProgress();
    for (const a of ACHIEVEMENTS) expect(p[a.key], a.key).toMatchObject({ have: 0 });
    const t = (await db.tasks.toArray())[0];
    await db.tasks.update(t.id, { status: 'done', completedAt: Date.now() });
    expect((await achievementProgress())['quests-50']).toEqual({ have: 1, need: 50, unit: 'quests' });
    await checkAchievements();
    expect((await db.unlocked.toArray()).map(u => u.key)).toEqual(['first-quest']);
  });
  it('finds the longest run of days', () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-06'])).toBe(3);
    expect(longestRun(['2026-10-31', '2026-11-01'])).toBe(2);
  });
});
