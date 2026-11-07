// The "ideal day" template, and its teaching-day variant generated from the user's schedule (T-2, 2026-11-07).
import { clockMin, isTeachingDay, type TeachingSchedule } from '@/game/rules';
import type { DateKey } from '@/db/types';
import { dateKey, parseKey } from './util';

export interface Block {
  start: string; end: string; title: string; icon: string;
  kind: 'body' | 'work' | 'mind' | 'rest' | 'admin' | 'away';
  /** Teaching-day blocks the Now card treats specially. */
  role?: 'pack' | 'travel' | 'classroom' | 'class';
  /** The area a work block is for (teaching prep goes to the schedule's area). */
  areaId?: string;
}

export const IDEAL_DAY: Block[] = [
  { start: '05:45', end: '06:00', title: 'Wake · water · make bed (no phone)', icon: 'sunrise', kind: 'body' },
  { start: '06:00', end: '06:45', title: 'Exercise', icon: 'discus', kind: 'body' },
  { start: '06:45', end: '07:15', title: 'Shower + breakfast', icon: 'bowl', kind: 'rest' },
  { start: '07:15', end: '08:00', title: 'Intel: newsletters + econ videos (1.5–2x)', icon: 'scroll', kind: 'mind' },
  { start: '08:00', end: '10:00', title: 'Deep work 1 — the $ quest (highest-paid task)', icon: 'drachma', kind: 'work' },
  { start: '10:00', end: '10:15', title: 'Break · walk · water', icon: 'path', kind: 'rest' },
  { start: '10:15', end: '12:15', title: 'Deep work 2 — clients (Weaving / freelance)', icon: 'amphora', kind: 'work' },
  { start: '12:15', end: '13:15', title: 'Lunch (away from screen)', icon: 'bowl', kind: 'rest' },
  { start: '13:15', end: '15:15', title: 'Deep work 3 — CIDE (class / prep / grading)', icon: 'owl', kind: 'work' },
  { start: '15:15', end: '15:30', title: 'Break', icon: 'cup', kind: 'rest' },
  { start: '15:30', end: '17:30', title: 'Deep work 4 — AI automation (learn by building)', icon: 'cog', kind: 'work' },
  { start: '17:30', end: '18:00', title: 'Clean 15m + money check-in + inbox zero', icon: 'wave', kind: 'admin' },
  { start: '18:00', end: '20:00', title: 'Free / hobbies (video, writing, website)', icon: 'mask', kind: 'mind' },
  { start: '20:00', end: '20:15', title: 'Shutdown: pick tomorrow’s top 3 quests', icon: 'lamp', kind: 'admin' },
  { start: '20:15', end: '21:45', title: 'Dinner · people · wind down (screens off 21:15)', icon: 'moon', kind: 'rest' },
  { start: '21:45', end: '22:00', title: 'Bed — lights out 22:00 (7h45 sleep)', icon: 'moon', kind: 'rest' }
];

export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Blocks before this time are the same on every day (wake, exercise, breakfast, intel). */
const MORNING_END = '08:00';
const LUNCH = { start: '12:15', end: '13:15' };
const PACK_MIN = 15;
const SHUTDOWN_MIN = 15;
const BED = { start: '21:45', end: '22:00' };

/**
 * The teaching-day Ideal Day (T-2): the usual morning, three prep blocks until 15 min before leaving, the money
 * check-in and packing, travel, the classroom (if an arrival time is set), the class, travel home, a 15-min
 * shutdown on arrival, then dinner, wind-down and bed. Every time comes from the schedule; blocks that the
 * schedule leaves no room for are dropped, never overlapped. `place` names the area in titles.
 */
export function teachingDay(s: TeachingSchedule, place = 'class'): Block[] {
  const leave = clockMin(s.leave)!, start = clockMin(s.classStart)!, end = clockMin(s.classEnd)!, home = clockMin(s.homeBy)!;
  const arrive = s.arrive ? clockMin(s.arrive) : null;
  const packAt = leave - PACK_MIN;
  const out: Block[] = IDEAL_DAY.filter(b => toMin(b.end) <= toMin(MORNING_END));
  // Before leaving: the prep blocks and lunch, clipped to the moment the packing starts.
  const before: Block[] = [
    { start: '08:00', end: '10:00', title: `Deep work 1 — class prep (${place})`, icon: 'owl', kind: 'work', areaId: s.areaId },
    { start: '10:00', end: '10:15', title: 'Break · walk · water', icon: 'path', kind: 'rest' },
    { start: '10:15', end: '12:15', title: `Deep work 2 — prep and grading (${place})`, icon: 'owl', kind: 'work', areaId: s.areaId },
    { start: LUNCH.start, end: LUNCH.end, title: 'Lunch (away from screen)', icon: 'bowl', kind: 'rest' },
    { start: LUNCH.end, end: hhmm(Math.max(packAt, toMin(LUNCH.end))), title: `Deep work 3 — final prep (${place})`, icon: 'owl', kind: 'work', areaId: s.areaId }
  ];
  for (const b of before) {
    const e = Math.min(toMin(b.end), packAt);
    if (e > toMin(b.start)) out.push({ ...b, end: hhmm(e) });
  }
  out.push({ start: hhmm(Math.max(packAt, toMin(MORNING_END))), end: s.leave, title: `Money check-in · pack for ${place}`, icon: 'wave', kind: 'admin', role: 'pack' });
  const reach = arrive ?? start;
  out.push({ start: s.leave, end: hhmm(reach), title: `On the way to ${place}`, icon: 'path', kind: 'away', role: 'travel' });
  if (reach < start) out.push({ start: hhmm(reach), end: s.classStart, title: 'Prepare the classroom', icon: 'lamp', kind: 'away', role: 'classroom' });
  out.push({ start: s.classStart, end: s.classEnd, title: `Class · ${place}`, icon: 'owl', kind: 'away', role: 'class' });
  if (home > end) out.push({ start: s.classEnd, end: s.homeBy, title: 'On the way home', icon: 'path', kind: 'away', role: 'travel' });
  // Back home: the shutdown on arrival, then dinner and wind-down until the usual bedtime.
  const shutEnd = home + SHUTDOWN_MIN;
  out.push({ start: s.homeBy, end: hhmm(shutEnd), title: 'Shutdown: pick tomorrow’s top 3 quests', icon: 'lamp', kind: 'admin' });
  if (shutEnd < toMin(BED.start)) out.push({ start: hhmm(shutEnd), end: BED.start, title: 'Dinner · people · wind down (screens off 21:15)', icon: 'moon', kind: 'rest' });
  const bedStart = Math.max(shutEnd, toMin(BED.start));
  out.push({ start: hhmm(bedStart), end: hhmm(Math.max(bedStart + 15, toMin(BED.end))), title: 'Bed — lights out 22:00', icon: 'moon', kind: 'rest' });
  return out;
}

/** The Ideal Day for a date: the teaching-day variant on teaching days, the usual template otherwise. */
export function idealDayFor(key: DateKey, s?: Partial<TeachingSchedule> | null, place?: string): Block[] {
  return isTeachingDay(key, s) ? teachingDay(s as TeachingSchedule, place) : IDEAL_DAY;
}

export function currentBlockIndex(now = new Date(), blocks: Block[] = IDEAL_DAY) {
  const m = now.getHours() * 60 + now.getMinutes();
  return blocks.findIndex(b => m >= toMin(b.start) && m < toMin(b.end));
}

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const icsDate = (key: string) => key.replace(/-/g, '');
/** RFC 5545: content lines longer than 75 octets fold onto continuation lines that start with a space. */
const fold = (line: string) => line.length <= 75 ? line : line.match(/.{1,74}/g)!.map((p, i) => (i ? ' ' : '') + p).join('\r\n');

/**
 * Build an .ics calendar with recurring routine events + alarms, so the tablet/laptop calendar does the reminding.
 * With a teaching schedule, teaching days get their own weekly events (BYDAY, until the semester ends), and the
 * usual blocks that differ skip those dates (EXDATE).
 */
export function routineIcs(schedule?: Partial<TeachingSchedule> | null, place?: string, today: DateKey = dateKey()) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life and How to Live It//Routine//EN', 'CALSCALE:GREGORIAN'];
  // Teaching dates still ahead in the semester.
  const teach: string[] = [];
  if (schedule && schedule.semesterEnd && today <= schedule.semesterEnd) {
    const d = parseKey(schedule.semesterStart && schedule.semesterStart > today ? schedule.semesterStart : today);
    for (let k = dateKey(d); k <= schedule.semesterEnd; d.setDate(d.getDate() + 1), k = dateKey(d)) if (isTeachingDay(k, schedule)) teach.push(k);
  }
  const tBlocks = teach.length ? teachingDay(schedule as TeachingSchedule, place) : [];
  const same = (a: Block, b: Block) => a.start === b.start && a.end === b.end && a.title === b.title;
  const event = (uid: string, day: string, b: Block, rule: string, exdates: string[] = []) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@life.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(day)}T${b.start.replace(':', '')}00`,
      `DTEND:${icsDate(day)}T${b.end.replace(':', '')}00`,
      rule,
      ...(exdates.length ? [fold(`EXDATE:${exdates.map(k => `${icsDate(k)}T${b.start.replace(':', '')}00`).join(',')}`)] : []),
      fold(`SUMMARY:${b.title}`),
      'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${b.title}`), 'TRIGGER:-PT5M', 'END:VALARM',
      'END:VEVENT'
    );
  };
  IDEAL_DAY.forEach((b, i) => event(`life-routine-${i}`, today, b, 'RRULE:FREQ=DAILY', tBlocks.some(t => same(t, b)) ? [] : teach));
  if (tBlocks.length) {
    const byDay = [...new Set(schedule!.days!)].sort().map(n => ICS_DAYS[n]).join(',');
    tBlocks.forEach((b, i) => {
      if (IDEAL_DAY.some(n => same(n, b))) return; // the shared morning is already a daily event
      event(`life-teaching-${i}`, teach[0], b, `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${icsDate(schedule!.semesterEnd!)}T235959`);
    });
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

