import { describe, it, expect } from 'vitest';
import { IDEAL_DAY, DEFAULT_WORK_START, WORK_START_CHOICES, idealDay, idealDayFor, routineIcs, teachingDay, toMin, workStartOf } from '../src/lib/routine';
import type { TeachingSchedule } from '../src/game/rules';

const row = (b: { start: string; end: string; title: string }) => `${b.start}-${b.end} ${b.title}`;
const contiguous = (bs: { start: string; end: string }[]) => bs.every((b, i) => i === 0 || b.start === bs[i - 1].end);

describe('work start', () => {
  it('08:00 is the default and gives the template of the master plan', () => {
    expect(IDEAL_DAY).toEqual(idealDay(DEFAULT_WORK_START));
    expect(IDEAL_DAY.slice(0, 5).map(row)).toEqual([
      '05:45-06:00 Wake · water · make bed (no phone)',
      '06:00-06:45 Exercise',
      '06:45-07:15 Shower + breakfast',
      '07:15-08:00 Intel: newsletters + econ videos (1.5–2x)',
      '08:00-10:00 Deep work 1 — the $ quest (highest-paid task)'
    ]);
  });

  it('08:45: exercise, breakfast and intel get 15 minutes more each; the work day moves; the evening absorbs it', () => {
    expect(idealDay('08:45').map(row)).toEqual([
      '05:45-06:00 Wake · water · make bed (no phone)',
      '06:00-07:00 Exercise',
      '07:00-07:45 Shower + breakfast',
      '07:45-08:45 Intel: newsletters + econ videos (1.5–2x)',
      '08:45-10:45 Deep work 1 — the $ quest (highest-paid task)',
      '10:45-11:00 Break · walk · water',
      '11:00-13:00 Deep work 2 — clients (Weaving / freelance)',
      '13:00-14:00 Lunch (away from screen)',
      '14:00-16:00 Deep work 3 — CIDE (class / prep / grading)',
      '16:00-16:15 Break',
      '16:15-18:15 Deep work 4 — AI automation (learn by building)',
      '18:15-18:45 Clean 15m + money check-in + inbox zero',
      '18:45-20:00 Free / hobbies (video, writing, website)',
      '20:00-20:15 Shutdown: pick tomorrow’s top 3 quests',
      '20:15-21:45 Dinner · people · wind down (screens off 21:15)',
      '21:45-22:00 Bed — lights out 22:00 (7h45 sleep)'
    ]);
  });

  it('every choice keeps 8 h of deep work, no gaps or overlaps, and the same wake, shutdown and bed', () => {
    for (const w of WORK_START_CHOICES) {
      const d = idealDay(w);
      expect(contiguous(d)).toBe(true);
      expect(d.every(b => toMin(b.end) > toMin(b.start))).toBe(true);
      expect(d.filter(b => b.kind === 'work').reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0)).toBe(480);
      expect(d.find(b => b.kind === 'work')!.start).toBe(w);
      expect(d.find(b => b.icon === 'mask')!.end).toBe('20:00');
      expect(toMin(d.find(b => b.icon === 'mask')!.end) - toMin(d.find(b => b.icon === 'mask')!.start)).toBeGreaterThanOrEqual(30);
      expect(d.map(b => b.title)).toEqual(IDEAL_DAY.map(b => b.title)); // same blocks, so calendar UIDs stay
    }
  });

  it('an unknown value falls back to 08:00', () => {
    expect(workStartOf(undefined)).toBe('08:00');
    expect(workStartOf('8:45')).toBe('08:00');
    expect(workStartOf('11:00')).toBe('08:00');
    expect(workStartOf('08:45')).toBe('08:45');
    expect(idealDayFor('2026-11-10', null, undefined, 'nonsense')).toBe(IDEAL_DAY);
  });

  it('teaching days start prep at the work start and keep the stretched morning', () => {
    const S: TeachingSchedule = { days: [1], leave: '14:00', classStart: '15:30', classEnd: '17:00', homeBy: '19:00', semesterStart: '2026-08-10', semesterEnd: '2026-12-04', areaId: 'cide' };
    const b = teachingDay(S, 'CIDE', '08:45');
    expect(b.slice(0, 4)).toEqual(idealDay('08:45').slice(0, 4));
    expect(b.map(row)).toContain('08:45-10:45 Deep work 1 — class prep (CIDE)');
    expect(b.map(row)).toContain('13:00-13:45 Lunch (away from screen)'); // clipped by packing
    expect(b.some(x => x.title.startsWith('Deep work 3'))).toBe(false); // no room before packing at 13:45
    expect(b.map(row)).toContain('13:45-14:00 Money check-in · pack for CIDE');
    expect(contiguous(b)).toBe(true);
  });

  it('the calendar export uses the work start and keeps the same event ids', () => {
    const a = routineIcs(undefined, undefined, '2026-11-10');
    const b = routineIcs(undefined, undefined, '2026-11-10', '08:45');
    expect(b).toContain('DTSTART:20261110T084500');
    const uids = (s: string) => s.split('\r\n').filter(l => l.startsWith('UID:'));
    expect(uids(b)).toEqual(uids(a));
  });
});
