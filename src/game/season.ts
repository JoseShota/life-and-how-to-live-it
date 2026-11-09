// Seasons and fresh starts (E-9). Pure: the date math for the season banner and which fresh-start banner Today shows.
// The plan text comes from 00-MASTER-PLAN.md §6 (plan text, not personal figures); the start date is a synced
// setting (`season`), so both devices show the same week.
import { addDays, differenceInCalendarDays } from 'date-fns';
import type { DateKey } from '@/db/types';
import { dateKey, parseKey } from '@/lib/util';

/** The synced setting: which season and the day it starts. */
export interface SeasonSetting { id: string; start: DateKey }

export const SEASON_1_ID = 'season:2026-11';
export const SEASON_NAME = 'Season 1';
/** §6: a 90-day campaign of 12 weeks. */
export const SEASON_DAYS = 90;
export const SEASON_WEEKS = 12;

export interface SeasonPhase { from: number; to: number; focus: string; doneWhen: string }

/** 00-MASTER-PLAN.md §6, week by week. */
export const SEASON_PHASES: SeasonPhase[] = [
  { from: 1, to: 2, focus: 'Install the system: app on tablet and laptop, routine in the calendar, cards configured, log every peso', doneWhen: '14 days of logs, 3+ Perfect Days' },
  { from: 3, to: 4, focus: 'Offer: write 3 packages, update the website, list 30 warm contacts', doneWhen: 'Website live with the offer and a contact' },
  { from: 5, to: 8, focus: 'Pipeline: 5 conversations a week, 1 automation case study every 2 weeks; December decisions', doneWhen: '≥ 1 paid automation project' },
  { from: 9, to: 12, focus: 'Retainers and review: convert 1 or 2 clients to monthly; Season review; set Season 2', doneWhen: '≥ 1 retainer; 1-month shield full' }
];

/** The days after week 12, up to day 90. */
export const SEASON_REVIEW_PHASE = { focus: 'Season review: look back at the 90 days, score the boss, set Season 2', doneWhen: 'Season 2 set' };

/** §6 "boss fight" (the 60 % counts Good-or-Perfect days, decided 2026-11-09). Live progress is P4-4. */
export const SEASON_BOSS = 'First retainer client + 1-month emergency fund + 30-day Good-or-Perfect rate ≥ 60 %';

export type SeasonStatus =
  | { state: 'unset' }
  | { state: 'before'; start: DateKey; end: DateKey; daysUntil: number }
  | { state: 'running'; start: DateKey; end: DateKey; day: number; week: number; phase: SeasonPhase }
  | { state: 'review'; start: DateKey; end: DateKey; day: number }
  | { state: 'after'; start: DateKey; end: DateKey };

const isKey = (k: unknown): k is DateKey => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && dateKey(parseKey(k)) === k;

/** The Monday of the Mon–Sun week holding `key`. */
export function mondayOf(key: DateKey): DateKey {
  const d = parseKey(key);
  return dateKey(addDays(d, -((d.getDay() + 6) % 7)));
}

/**
 * Where `today` sits in the season. Day 1 is the start date and the last day is day 90. Weeks follow the Mon–Sun
 * weeks of the weekly review and scorecard: week 1 is the week holding the start date (shorter if the season starts
 * mid-week). After week 12, the days left until day 90 are the season review.
 */
export function seasonStatus(today: DateKey, s?: Partial<SeasonSetting> | null): SeasonStatus {
  if (!s || !isKey(s.start)) return { state: 'unset' };
  const start = s.start;
  const end = dateKey(addDays(parseKey(start), SEASON_DAYS - 1));
  const day = differenceInCalendarDays(parseKey(today), parseKey(start)) + 1;
  if (day < 1) return { state: 'before', start, end, daysUntil: 1 - day };
  if (day > SEASON_DAYS) return { state: 'after', start, end };
  const week = Math.floor(differenceInCalendarDays(parseKey(today), parseKey(mondayOf(start))) / 7) + 1;
  if (week > SEASON_WEEKS) return { state: 'review', start, end, day };
  const phase = SEASON_PHASES.find(p => week >= p.from && week <= p.to)!;
  return { state: 'running', start, end, day, week, phase };
}

// ---------- Fresh starts ----------

/** Month banners show on the first days of a month, so a 1st spent away from the app still gets one. */
export const MONTH_BANNER_DAYS = 3;

export type FreshStart =
  | { kind: 'sunday-review' }
  | { kind: 'monday'; key: string }
  | { kind: 'month'; key: string; month: string };

/** The month before `today`'s, as `YYYY-MM`. */
export function previousMonth(today: DateKey): string {
  const d = parseKey(today);
  return dateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7);
}

/**
 * The one fresh-start banner Today shows, if any. The Sunday review prompt (until the week's review pays) wins,
 * then Monday, then the first days of the month. Monday and month banners close for good once dismissed:
 * `dismissed` holds the latest dismissed keys (a synced setting, so both devices agree).
 */
export function freshStartFor(today: DateKey, o: { reviewPaid: boolean; dismissed?: readonly string[] | null }): FreshStart | null {
  const closed = (key: string) => !!o.dismissed?.includes(key);
  const d = parseKey(today);
  if (d.getDay() === 0 && !o.reviewPaid) return { kind: 'sunday-review' };
  if (d.getDay() === 1 && !closed(`week:${today}`)) return { kind: 'monday', key: `week:${today}` };
  const monthKey = `month:${today.slice(0, 7)}`;
  if (d.getDate() <= MONTH_BANNER_DAYS && !closed(monthKey)) return { kind: 'month', key: monthKey, month: previousMonth(today) };
  return null;
}

/** Dismissed keys kept: enough for a month banner and a Monday in the same few days. */
export const DISMISSED_KEPT = 6;

/** The dismissed list after closing `key`: newest first, without repeats, capped. */
export const withDismissed = (list: readonly string[] | null | undefined, key: string) =>
  [key, ...(list ?? []).filter(k => k !== key)].slice(0, DISMISSED_KEPT);
