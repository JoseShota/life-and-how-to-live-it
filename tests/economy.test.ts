import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, migrateHabitV3 } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { logSession, deleteSession, setHabit, evaluateWeek } from '../src/game/engine';
import {
  allocateFocusXp, targetsFor, dayGrade, weeklyScore, DEFAULT_WORK_TARGETS, WORKDAY_BONUS_XP, GOOD_DAY_XP, PERFECT_DAY_XP, WEEKLY_SCORECARD
} from '../src/game/rules';

const WED = '2026-11-04', SAT = '2026-11-07';
const at = (key: string, h: number) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };
const hours = (n: number) => n * 3600e3;

describe('economy B rules (pure)', () => {
  it('weekday and weekend targets', () => {
    expect(targetsFor(WED)).toEqual({ done: 6, full: 8 });
    expect(targetsFor(SAT)).toEqual({ done: 4, full: 6 });
  });
  it('focus XP stops at the full target, in start order', () => {
    const alloc = allocateFocusXp([{ id: 'b', start: 2, minutes: 300 }, { id: 'a', start: 1, minutes: 300 }], 8);
    expect(alloc.get('a')).toBe(100); // 5 h
    expect(alloc.get('b')).toBe(60);  // only 3 h left before 8 h
  });
  it('day grade: perfect needs every core habit in full, good needs 3 in any version', () => {
    expect(dayGrade(4, 4, 4)).toBe('perfect');
    expect(dayGrade(4, 3, 4)).toBe('good');
    expect(dayGrade(4, 1, 3)).toBe('good');
    expect(dayGrade(4, 2, 2)).toBe('none');
  });
  it('weekly scorecard needs 3 of 4 targets', () => {
    expect(weeklyScore({ focusHours: 31, exerciseDays: 4, moneyDays: 5, goodDays: 0 }).earned).toBe(true);
    expect(weeklyScore({ focusHours: 31, exerciseDays: 4, moneyDays: 1, goodDays: 0 }).earned).toBe(false);
  });
  it('v3 migration moves wake, clean and intel out of core', () => {
    const h = { key: 'intel', core: true, name: 'x' } as { key: string; core: boolean; intrinsic?: boolean; name: string };
    migrateHabitV3(h);
    expect(h).toMatchObject({ core: false, intrinsic: true });
    const w = { key: 'work', core: true, name: 'Deep work 8 h', target: 8 };
    migrateHabitV3(w);
    expect(w).toMatchObject({ core: true, name: 'Deep work', target: DEFAULT_WORK_TARGETS.weekday.done });
  });
});

describe('economy B engine', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  const work = async () => (await db.habits.where('key').equals('work').first())!;
  const area = async (kind?: string) => (await db.areas.toArray()).find(a => !kind || a.kind === kind)!;
  const sessionXpTotal = async () => (await db.xp.where('source').equals('session').toArray()).reduce((s, e) => s + e.xp, 0);

  it('weekday: 6 h checks the habit, 8 h earns the bonus, focus pays nothing after 8 h', async () => {
    const a = await area();
    await logSession(a.id, at(WED, 7), at(WED, 7) + hours(6));
    const w = await work();
    expect((await db.habitLogs.get(`${w.id}:${WED}`))!.done).toBe(true);
    expect(await db.xp.where('refId').equals(`workday:${WED}`).count()).toBe(0);
    await logSession(a.id, at(WED, 14), at(WED, 14) + hours(3));
    expect((await db.xp.where('refId').equals(`workday:${WED}`).first())!.xp).toBe(WORKDAY_BONUS_XP);
    expect(await sessionXpTotal()).toBe(160); // 8 h × 20, the 9th hour pays nothing
  });

  it('weekend: 4 h is done, 6 h is full', async () => {
    const a = await area();
    await logSession(a.id, at(SAT, 9), at(SAT, 9) + hours(4));
    const w = await work();
    expect((await db.habitLogs.get(`${w.id}:${SAT}`))!.done).toBe(true);
    await logSession(a.id, at(SAT, 14), at(SAT, 14) + hours(2));
    expect(await db.xp.where('refId').equals(`workday:${SAT}`).count()).toBe(1);
  });

  it('deleting a session hands its paid minutes back to the later ones', async () => {
    const a = await area();
    const first = await logSession(a.id, at(WED, 6), at(WED, 6) + hours(5));
    await logSession(a.id, at(WED, 12), at(WED, 12) + hours(5));
    expect(await sessionXpTotal()).toBe(160);
    await deleteSession(first!);
    expect(await sessionXpTotal()).toBe(100);
  });

  it('hobby focus and intrinsic habits pay XP but no coins', async () => {
    const hobby = await area('hobby');
    await logSession(hobby.id, at(WED, 18), at(WED, 18) + hours(1));
    const s = (await db.xp.where('source').equals('session').first())!;
    expect(s.xp).toBe(20); expect(s.coins).toBe(0);
    const intel = (await db.habits.where('key').equals('intel').first())!;
    await setHabit(intel, WED, 1);
    const h = (await db.xp.where('refId').equals(`habit:${intel.id}:${WED}`).first())!;
    expect(h.xp).toBeGreaterThan(0); expect(h.coins).toBe(0);
  });

  it('3 of 4 core habits is a Good Day; all 4 is a Perfect Day (not both)', async () => {
    const by = async (k: string) => (await db.habits.where('key').equals(k).first())!;
    await setHabit(await by('sleep'), WED, 8);
    await setHabit(await by('exercise'), WED, 1);
    await setHabit(await by('money'), WED, 1);
    expect((await db.xp.where('refId').equals(`good:${WED}`).first())!.xp).toBe(GOOD_DAY_XP);
    await logSession((await area()).id, at(WED, 8), at(WED, 8) + hours(6));
    expect((await db.xp.where('refId').equals(`perfect:${WED}`).first())!.xp).toBe(PERFECT_DAY_XP);
    expect(await db.xp.where('refId').equals(`good:${WED}`).count()).toBe(0);
  });

  it('weekly scorecard pays once when 3 of 4 targets are hit, and is revoked if they drop', async () => {
    const a = await area();
    const ex = (await db.habits.where('key').equals('exercise').first())!;
    const money = (await db.habits.where('key').equals('money').first())!;
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
    for (const d of days) {
      await logSession(a.id, at(d, 8), at(d, 8) + hours(6));
      await setHabit(ex, d, 1);
      await setHabit(money, d, 1);
    }
    const row = await db.xp.where('refId').equals('week:2026-11-02').toArray();
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ xp: WEEKLY_SCORECARD.xp, date: '2026-11-08' });
    for (const d of days) await setHabit(money, d, 0);
    for (const d of days.slice(0, 2)) await setHabit(ex, d, 0);
    await evaluateWeek('2026-11-02');
    expect(await db.xp.where('refId').equals('week:2026-11-02').count()).toBe(0);
  });
});
