// The "ideal day" template. Class hours at CIDE replace a deep-work block on teaching days.
export interface Block { start: string; end: string; title: string; icon: string; kind: 'body' | 'work' | 'mind' | 'rest' | 'admin' }

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

export function currentBlockIndex(now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes();
  return IDEAL_DAY.findIndex(b => m >= toMin(b.start) && m < toMin(b.end));
}

/** Build an .ics calendar with daily recurring routine events + alarms, so the tablet/laptop calendar does the reminding. */
export function routineIcs(blocks: Block[] = IDEAL_DAY) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life and How to Live It//Routine//EN', 'CALSCALE:GREGORIAN'];
  blocks.forEach((b, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:life-routine-${i}@life.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${day}T${b.start.replace(':', '')}00`,
      `DTEND:${day}T${b.end.replace(':', '')}00`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${b.title}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${b.title}`, 'TRIGGER:-PT5M', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
