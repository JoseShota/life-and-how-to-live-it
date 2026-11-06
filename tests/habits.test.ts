import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { setHabit, logSession, habitStreak, applyShields, shieldBank } from '../src/game/engine';
import { MIN_VERSION_SHARE, SHIELD_EVERY } from '../src/game/rules';

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await seedIfEmpty();
});

const by = async (k: string) => (await db.habits.where('key').equals(k).first())!;
const day = (i: number) => { const d = new Date(2026, 9, 1 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const at = (key: string, h: number) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };

describe('habit science (V-3)', () => {
  it('seeds the Eat well ritual and plans for every habit', async () => {
    const eat = await by('eat');
    expect(eat).toMatchObject({ core: false, minLabel: 'A vegetable at lunch' });
    expect((await by('exercise')).plan).toMatch(/^When /);
  });

  it('a min version pays half XP, keeps the streak and counts for a Good Day, not a Perfect Day', async () => {
    const ex = await by('exercise');
    await setHabit(ex, day(0), 1);
    await setHabit(ex, day(1), 0, true);
    const row = (await db.xp.where('refId').equals(`habit:${ex.id}:${day(1)}`).first())!;
    expect(row.xp).toBe(Math.round(ex.xp * MIN_VERSION_SHARE));
    expect(await habitStreak(ex.id, day(1))).toBe(2);
    await setHabit(await by('sleep'), day(1), 8);
    await setHabit(await by('money'), day(1), 1);
    await logSession((await db.areas.toArray())[0].id, at(day(1), 8), at(day(1), 15)); // Thu: 7 h ≥ 6 h
    expect(await db.xp.where('refId').equals(`good:${day(1)}`).count()).toBe(1);
    expect(await db.xp.where('refId').equals(`perfect:${day(1)}`).count()).toBe(0);
  });

  it('2 h of focus is the deep-work minimum version', async () => {
    const work = await by('work');
    await logSession((await db.areas.toArray())[0].id, at(day(1), 8), at(day(1), 10.5));
    expect(await db.habitLogs.get(`${work.id}:${day(1)}`)).toMatchObject({ done: true, min: true });
  });

  it('7 Good days in a row earn a shield; a shield covers one missed day without breaking the streak', async () => {
    const [sleep, ex, money] = [await by('sleep'), await by('exercise'), await by('money')];
    for (let i = 0; i < SHIELD_EVERY; i++) {
      await setHabit(sleep, day(i), 8); await setHabit(ex, day(i), 1); await setHabit(money, day(i), 1);
    }
    expect(await shieldBank()).toBe(1);
    // Day 7 is missed entirely; on day 8 the app opens and spends shields.
    const protectedHabits = await applyShields(day(8));
    expect(protectedHabits).toContain(sleep.name);
    expect(await shieldBank()).toBe(0);
    await setHabit(sleep, day(8), 8);
    expect(await habitStreak(sleep.id, day(8))).toBe(SHIELD_EVERY + 1);
    // Exercise wasn't protected (the bank ran out), so its streak restarts.
    await setHabit(ex, day(8), 1);
    expect(await habitStreak(ex.id, day(8))).toBe(1);
  });
});
