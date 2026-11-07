import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, setSetting } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { logSession, regradeTeachingChange } from '../src/game/engine';
import {
  isTeachingDay, targetsFor, teachingProblems, teachingStatusChanged, teachingReady, withTargetDefaults, DEFAULT_WORK_TARGETS, type TeachingSchedule
} from '../src/game/rules';
import { idealDayFor, currentBlockIndex, routineIcs, teachingDay, IDEAL_DAY } from '../src/lib/routine';
import { extraHoursByArea, scheduleAreaHours, teachingDoubleCount } from '../src/finance/finance';
import type { AreaHours } from '../src/db/types';

// A made-up schedule (the user's real one lives only on their device): Mon + Wed, 5 h away a day.
const S: TeachingSchedule = {
  days: [1, 3], leave: '14:00', classStart: '15:30', classEnd: '17:00', homeBy: '19:00',
  semesterStart: '2026-08-10', semesterEnd: '2026-12-04', areaId: 'cide'
};
const MON = '2026-11-09', TUE = '2026-11-10', WED = '2026-11-11', MON_AFTER = '2026-12-07', SAT = '2026-11-14';

describe('teaching days: rules (pure)', () => {
  it('a Monday inside the semester uses 4/5; outside it, and a Tuesday, use 6/8', () => {
    expect(isTeachingDay(MON, S)).toBe(true);
    expect(isTeachingDay(WED, S)).toBe(true);
    expect(targetsFor(MON, DEFAULT_WORK_TARGETS, S)).toEqual({ done: 4, full: 5 });
    expect(targetsFor(MON_AFTER, DEFAULT_WORK_TARGETS, S)).toEqual({ done: 6, full: 8 });
    expect(targetsFor(TUE, DEFAULT_WORK_TARGETS, S)).toEqual({ done: 6, full: 8 });
    expect(targetsFor(SAT, DEFAULT_WORK_TARGETS, S)).toEqual({ done: 4, full: 6 });
    expect(targetsFor(MON)).toEqual({ done: 6, full: 8 }); // no schedule: a normal weekday
    // The semester bounds are inclusive.
    expect(isTeachingDay('2026-08-10', S)).toBe(true);
    expect(isTeachingDay('2026-08-03', S)).toBe(false);
  });

  it('an incomplete or inconsistent schedule changes nothing', () => {
    expect(teachingProblems(undefined)).toContain('days');
    expect(teachingProblems({ ...S, areaId: '' })).toEqual(['area']);
    expect(teachingProblems({ ...S, classEnd: '15:00' })).toEqual(['time order']);
    expect(teachingProblems({ ...S, arrive: '16:00' })).toEqual(['time order']);
    expect(teachingProblems({ ...S, semesterEnd: '2026-08-01' })).toEqual(['semester order']);
    expect(isTeachingDay(MON, { ...S, days: [] })).toBe(false);
    expect(teachingReady(S)).toBe(true);
  });

  it('targets stored before v12 get the teaching pair; the user\'s numbers stay', () => {
    expect(withTargetDefaults({ weekday: { done: 5, full: 7 }, weekend: { done: 3, full: 5 } }))
      .toEqual({ weekday: { done: 5, full: 7 }, weekend: { done: 3, full: 5 }, teaching: { done: 4, full: 5 } });
    expect(withTargetDefaults(undefined)).toEqual(DEFAULT_WORK_TARGETS);
  });
});

describe('teaching days: the Ideal Day', () => {
  const blocks = teachingDay(S, 'CIDE');
  const row = (b: { start: string; end: string; title: string }) => `${b.start}-${b.end} ${b.title}`;

  it('generates the approved blocks from the schedule\'s times', () => {
    expect(blocks.slice(0, 4)).toEqual(IDEAL_DAY.slice(0, 4)); // the morning before 08:00 is unchanged
    expect(blocks.slice(4).map(row)).toEqual([
      '08:00-10:00 Deep work 1 — class prep (CIDE)',
      '10:00-10:15 Break · walk · water',
      '10:15-12:15 Deep work 2 — prep and grading (CIDE)',
      '12:15-13:15 Lunch (away from screen)',
      '13:15-13:45 Deep work 3 — final prep (CIDE)',
      '13:45-14:00 Money check-in · pack for CIDE',
      '14:00-15:30 On the way to CIDE',
      '15:30-17:00 Class · CIDE',
      '17:00-19:00 On the way home',
      '19:00-19:15 Shutdown: pick tomorrow’s top 3 quests',
      '19:15-21:45 Dinner · people · wind down (screens off 21:15)',
      '21:45-22:00 Bed — lights out 22:00'
    ]);
    // Prep blocks go to the schedule's area; the class and the road are not focus time.
    expect(blocks.filter(b => b.kind === 'work').every(b => b.areaId === 'cide')).toBe(true);
    expect(blocks.find(b => b.role === 'class')!.kind).toBe('away');
    // 5 h of focus fit before leaving: 2 + 2 + 0.5 here, the rest is the user's to place.
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].start).toBe(blocks[i - 1].end); // no gaps, no overlaps
  });

  it('an arrival time adds the classroom block; a late departure keeps all three prep blocks whole', () => {
    const b = teachingDay({ ...S, leave: '14:30', arrive: '15:50', classStart: '16:10', classEnd: '17:40', homeBy: '19:30' }, 'CIDE');
    expect(b.map(row)).toContain('14:15-14:30 Money check-in · pack for CIDE');
    expect(b.map(row)).toContain('14:30-15:50 On the way to CIDE');
    expect(b.map(row)).toContain('15:50-16:10 Prepare the classroom');
    expect(b.map(row)).toContain('13:15-14:15 Deep work 3 — final prep (CIDE)');
    expect(b.map(row)).toContain('19:30-19:45 Shutdown: pick tomorrow’s top 3 quests');
  });

  it('an early departure drops the blocks it leaves no room for', () => {
    const b = teachingDay({ ...S, leave: '11:00', classStart: '12:00', classEnd: '13:00', homeBy: '14:00' }, 'CIDE');
    expect(b.map(row)).toContain('10:15-10:45 Deep work 2 — prep and grading (CIDE)');
    expect(b.some(x => x.title.startsWith('Lunch') || x.title.startsWith('Deep work 3'))).toBe(false);
    for (let i = 1; i < b.length; i++) expect(b[i].start).toBe(b[i - 1].end);
  });

  it('idealDayFor picks the variant by date; the Now block follows it', () => {
    expect(idealDayFor(TUE, S)).toBe(IDEAL_DAY);
    expect(idealDayFor(MON_AFTER, S)).toBe(IDEAL_DAY);
    const mon = idealDayFor(MON, S, 'CIDE');
    expect(mon[currentBlockIndex(new Date(2026, 10, 9, 8, 30), mon)].title).toBe('Deep work 1 — class prep (CIDE)');
    expect(mon[currentBlockIndex(new Date(2026, 10, 9, 15, 0), mon)].role).toBe('travel');
  });

  it('the calendar export gives teaching days their own weekly events until the semester ends', () => {
    const ics = routineIcs(S, 'CIDE', MON);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261204T235959');
    expect(ics).toContain('SUMMARY:On the way to CIDE');
    expect(ics).toMatch(/EXDATE:20261109T080000,20261111T080000/); // the usual deep work 1 skips teaching dates
    expect(ics.split('\r\n').every(l => l.length <= 75)).toBe(true);
    expect(routineIcs(undefined, undefined, MON)).not.toContain('BYDAY');
  });
});

describe('teaching days: hours for the real MXN/h', () => {
  it('the schedule counts 5 h a day, 10 h a week, and stops at the semester end', () => {
    const virt = scheduleAreaHours(S);
    expect(extraHoursByArea(virt, '2026-11-09', '2026-11-15').get('cide')).toBe(10);
    expect(extraHoursByArea(virt, '2026-11-30', '2026-12-06').get('cide')).toBe(10); // Mon 30 + Wed 2
    expect(extraHoursByArea(virt, '2026-12-07', '2026-12-31').get('cide')).toBeUndefined();
    expect(scheduleAreaHours({ ...S, areaId: '' })).toEqual([]);
  });

  it('flags a manual weekly entry that overlaps the semester', () => {
    const e = (id: string, date: string, until?: string, areaId = 'cide'): AreaHours => ({ id, areaId, date, hours: 6, weekly: true, until, createdAt: 0 });
    expect(teachingDoubleCount([e('a', '2026-09-01')], S)).toHaveLength(1);
    expect(teachingDoubleCount([e('b', '2026-01-01', '2026-06-30')], S)).toHaveLength(0);
    expect(teachingDoubleCount([e('c', '2026-09-01', undefined, 'free')], S)).toHaveLength(0);
  });
});

describe('teaching days: the engine', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  const at = (key: string, h: number) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };

  it('focus XP stops at 5 h on a teaching day; 5 h earns the workday bonus there', async () => {
    const area = (await db.areas.toArray())[0];
    await setSetting('teachingSchedule', { ...S, areaId: area.id });
    await logSession(area.id, at(MON, 8), at(MON, 14)); // 6 h
    const focus = await db.xp.where('date').equals(MON).filter(e => e.source === 'session').toArray();
    expect(focus.reduce((s, e) => s + e.xp, 0)).toBe(100); // 5 h × 20, the 6th hour pays nothing
    expect(await db.xp.where('refId').equals(`workday:${MON}`).count()).toBe(1);
    // The same 6 h on a Tuesday: all paid, no workday bonus (8 h full).
    await logSession(area.id, at(TUE, 8), at(TUE, 14));
    const tue = await db.xp.where('date').equals(TUE).filter(e => e.source === 'session').toArray();
    expect(tue.reduce((s, e) => s + e.xp, 0)).toBe(120);
    expect(await db.xp.where('refId').equals(`workday:${TUE}`).count()).toBe(0);
  });
});

describe('teaching days: re-grading past days when the schedule changes', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  const at = (key: string, h: number) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };

  it('lists the dates whose status changed, oldest first, up to today', () => {
    expect(teachingStatusChanged(undefined, S, '2026-08-20')).toEqual(['2026-08-10', '2026-08-12', '2026-08-17', '2026-08-19']);
    expect(teachingStatusChanged(S, S, MON)).toEqual([]);
    expect(teachingStatusChanged(S, { ...S, days: [1] }, '2026-08-20')).toEqual(['2026-08-12', '2026-08-19']);
    expect(teachingStatusChanged(undefined, { ...S, areaId: '' }, MON)).toEqual([]); // incomplete: nothing moves
  });

  it('a past Monday with focus logged is re-graded both ways; empty days are left alone', async () => {
    const area = (await db.areas.toArray())[0];
    const past = '2026-11-02'; // a Monday inside the semester
    await logSession(area.id, at(past, 8), at(past, 14)); // 6 h, graded as a normal weekday
    const workday = () => db.xp.where('refId').equals(`workday:${past}`).count();
    const focusXp = async () => (await db.xp.where('date').equals(past).filter(e => e.source === 'session').toArray()).reduce((s, e) => s + e.xp, 0);
    expect([await workday(), await focusXp()]).toEqual([0, 120]);

    const s = { ...S, areaId: area.id };
    await setSetting('teachingSchedule', s);
    expect(await regradeTeachingChange(undefined, s, MON)).toEqual([past]); // only the day with sessions
    expect([await workday(), await focusXp()]).toEqual([1, 100]);
    expect(await db.habitLogs.where('date').equals('2026-10-26').count()).toBe(0); // an empty Monday stays empty

    await db.settings.delete('teachingSchedule');
    await regradeTeachingChange(s, undefined, MON);
    expect([await workday(), await focusXp()]).toEqual([0, 120]);
  });
});
