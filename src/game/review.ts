// PURE weekly-review aggregates (P1-4). No DB, no React: the Review page loads the rows and passes them in.
import type { Area, PipelineEvent, Session, XpEvent } from '@/db/types';

/** The 7 date keys of the week starting on Monday `monday`. */
export function weekDays(monday: string) {
  const [y, m, d] = monday.split('-').map(Number);
  const p = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(y, m - 1, d + i);
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  });
}

export type DayMark = 'perfect' | 'good' | 'none';

/** Day grades from the ledger (the engine writes `perfect:<date>` / `good:<date>`), the rate, and the week's XP. */
export function weekGrades(days: string[], xp: XpEvent[]) {
  const marks: { date: string; mark: DayMark }[] = days.map(date => {
    const e = xp.filter(x => x.date === date);
    return { date, mark: e.some(x => x.source === 'perfect-day') ? 'perfect' : e.some(x => x.source === 'good-day') ? 'good' : 'none' };
  });
  const perfect = marks.filter(m => m.mark === 'perfect').length;
  const good = marks.filter(m => m.mark === 'good').length;
  const inWeek = xp.filter(x => days.includes(x.date));
  return {
    marks, perfect, good, rate: (perfect + good) / days.length,
    xp: inWeek.reduce((s, x) => s + x.xp, 0),
    coins: inWeek.filter(x => x.coins > 0).reduce((s, x) => s + x.coins, 0)
  };
}

/** Hours per area in the week against its weekly target. `extraHours` adds non-focus hours by area (E-10). */
export function hoursByArea(areas: Area[], sessions: Session[], days: string[], extraHours: Map<string, number> = new Map()) {
  const from = days[0], to = days[days.length - 1];
  return areas.filter(a => !a.archived).map(a => {
    const focus = sessions.filter(s => s.areaId === a.id && s.date >= from && s.date <= to).reduce((s, x) => s + x.minutes, 0) / 60;
    const other = extraHours.get(a.id) ?? 0;
    const hours = focus + other;
    return { area: a, focus, other, hours, target: a.weeklyHoursTarget, share: a.weeklyHoursTarget > 0 ? hours / a.weeklyHoursTarget : hours > 0 ? 1 : 0 };
  }).filter(r => r.hours > 0 || r.target > 0);
}

/** Leading indicators logged in the week (the stage moves are counted apart). */
export function pipelineCounts(events: PipelineEvent[], days: string[]) {
  const e = events.filter(x => days.includes(x.date));
  const n = (k: PipelineEvent['kind']) => e.filter(x => x.kind === k).length;
  return { conversations: n('conversation'), proposals: n('proposal'), caseStudies: n('case-study'), stageMoves: n('stage') };
}
