// PURE date math for repeating quests (P1-1). No DB, no React.
import type { DateKey, Recurrence } from '@/db/types';

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k: DateKey) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** One period after `from`. Monthly keeps the anchor day (31 → Feb 28 → Mar 31), so it never drifts. */
export function addPeriod(from: DateKey, r: Pick<Recurrence, 'every' | 'anchorDay'>): DateKey {
  const d = parse(from);
  if (r.every === 'day') d.setDate(d.getDate() + 1);
  else if (r.every === 'week') d.setDate(d.getDate() + 7);
  else {
    const y = d.getFullYear(), m = d.getMonth() + 1;
    const ny = y + Math.floor(m / 12), nm = m % 12;
    return key(new Date(ny, nm, Math.min(r.anchorDay ?? d.getDate(), daysIn(ny, nm))));
  }
  return key(d);
}

/**
 * Due date of the next instance, for a quest due `due` (or undated) completed on `doneOn`.
 * Missed periods are skipped, so a daily quest finished late isn't born overdue; `keepMissed` series
 * (the RESICO declaration: every month must be filed) always move exactly one period.
 */
export function nextDue(r: Recurrence, due: DateKey | undefined, doneOn: DateKey): DateKey {
  let next = addPeriod(due ?? doneOn, r);
  if (!r.keepMissed) while (next <= doneOn) next = addPeriod(next, r);
  return next;
}

/** Deterministic id of an instance, so completing, reopening and completing again never duplicates it. */
export const instanceId = (series: string, due: DateKey) => `${series}@${due}`;

/** A new recurrence anchored on the quest's due date (monthly keeps that day of the month). */
export function makeRecurrence(every: Recurrence['every'], series: string, due: DateKey): Recurrence {
  return { every, series, ...(every === 'month' ? { anchorDay: parse(due).getDate() } : {}) };
}

export const RECURRENCE_LABEL: Record<Recurrence['every'], string> = { day: 'every day', week: 'every week', month: 'every month' };
