// Pure game-balance functions. No DB access here -> easy to unit test and tune.
import type { DateKey, Difficulty } from '@/db/types';

export const TASK_XP: Record<Difficulty, number> = { 1: 5, 2: 15, 3: 35, 4: 75, 5: 150 };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Trivial', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Epic' };

/** Coins are the spendable currency; 1 coin per 5 XP. */
export const coinsFor = (xp: number) => Math.round(xp / 5);

/** Focus pays 20 XP per hour, pro-rata per minute (a 50-minute sprint pays 16). */
export const FOCUS_XP_PER_HOUR = 20;
export const sessionXp = (minutes: number) => Math.floor((Math.max(0, minutes) * FOCUS_XP_PER_HOUR) / 60);

/** Deep-work targets in hours. "done" checks the deep-work habit; "full" earns the workday bonus and is where focus XP stops. */
export interface DayTargets { done: number; full: number }
export interface WorkTargets { weekday: DayTargets; weekend: DayTargets; teaching: DayTargets }
/**
 * Teaching days (approved 2026-11-07, T-3): 5 h is the focus window before leaving for class, and done stays
 * about 75 % of full, like weekdays. The class itself is not focus time (T-4).
 */
export const DEFAULT_WORK_TARGETS: WorkTargets = { weekday: { done: 6, full: 8 }, weekend: { done: 4, full: 6 }, teaching: { done: 4, full: 5 } };

/** Fills targets missing from a stored value (stored before v12, or restored from an older backup). */
export function withTargetDefaults(t?: Partial<WorkTargets> | null): WorkTargets {
  return { ...DEFAULT_WORK_TARGETS, ...(t ?? {}) };
}

/**
 * The user's teaching schedule (the `teachingSchedule` setting; empty by default, entered in Control).
 * Times are local "HH:MM"; `days` are JS weekdays (0 = Sunday). `arrive` is optional: when set, the time between
 * arriving and the class is its own "prepare the classroom" block.
 */
export interface TeachingSchedule {
  days: number[];
  leave: string;
  arrive?: string;
  classStart: string;
  classEnd: string;
  homeBy: string;
  semesterStart: DateKey | '';
  semesterEnd: DateKey | '';
  areaId: string;
}
export const EMPTY_TEACHING_SCHEDULE: TeachingSchedule = {
  days: [], leave: '', classStart: '', classEnd: '', homeBy: '', semesterStart: '', semesterEnd: '', areaId: ''
};

/** Minutes after midnight for "HH:MM", or null if it isn't a time. */
export function clockMin(hhmm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * What still keeps a schedule from applying (empty = it applies). Nothing about teaching changes until every
 * field is in place, so a half-typed schedule never moves targets or hours.
 */
export function teachingProblems(s?: Partial<TeachingSchedule> | null): string[] {
  if (!s) return ['days', 'times', 'semester', 'area'];
  const out: string[] = [];
  if (!s.days?.length) out.push('days');
  const [leave, arrive, start, end, home] = [s.leave, s.arrive, s.classStart, s.classEnd, s.homeBy].map(clockMin);
  if (leave === null || start === null || end === null || home === null) out.push('times');
  else if (!(leave < start && start < end && end <= home) || (s.arrive && (arrive === null || arrive < leave || arrive > start))) out.push('time order');
  if (!s.semesterStart || !s.semesterEnd) out.push('semester');
  else if (s.semesterStart > s.semesterEnd) out.push('semester order');
  if (!s.areaId) out.push('area');
  return out;
}
export const teachingReady = (s?: Partial<TeachingSchedule> | null): s is TeachingSchedule => teachingProblems(s).length === 0;

const weekdayOf = (key: DateKey) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };

/** A teaching day: one of the schedule's weekdays, inside the semester (inclusive). */
export function isTeachingDay(key: DateKey, s?: Partial<TeachingSchedule> | null): boolean {
  if (!teachingReady(s)) return false;
  return key >= s.semesterStart && key <= s.semesterEnd && s.days.includes(weekdayOf(key));
}

/**
 * Dates up to `until` whose teaching status differs between two schedules, oldest first: the past days a schedule
 * change re-grades (their targets moved). Only the semesters' ranges can differ, so only those are scanned.
 */
export function teachingStatusChanged(before: Partial<TeachingSchedule> | null | undefined, after: Partial<TeachingSchedule> | null | undefined, until: DateKey): DateKey[] {
  const ranges = [before, after].filter(teachingReady).map(s => [s.semesterStart, s.semesterEnd] as const);
  if (!ranges.length) return [];
  const from = ranges.map(r => r[0]).sort()[0];
  const lastEnd = ranges.map(r => r[1]).sort().pop()!;
  const to = until < lastEnd ? until : lastEnd;
  const out: DateKey[] = [];
  const [y, m, d] = from.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const key = () => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  for (let k = key(); k <= to; day.setDate(day.getDate() + 1), k = key()) {
    if (isTeachingDay(k, before) !== isTeachingDay(k, after)) out.push(k);
  }
  return out;
}

/** Hours away from the desk on a teaching day (leave home → home again): travel, classroom and class. */
export function teachingHoursPerDay(s: TeachingSchedule) {
  return ((clockMin(s.homeBy) ?? 0) - (clockMin(s.leave) ?? 0)) / 60;
}

export const isWeekend = (key: DateKey) => {
  const day = weekdayOf(key);
  return day === 0 || day === 6;
};
/** The day's deep-work targets: teaching days first (they can fall on any weekday), then weekend or weekday. */
export const targetsFor = (key: DateKey, t: WorkTargets = DEFAULT_WORK_TARGETS, s?: Partial<TeachingSchedule> | null) =>
  isTeachingDay(key, s) ? (t.teaching ?? DEFAULT_WORK_TARGETS.teaching) : isWeekend(key) ? t.weekend : t.weekday;

/**
 * Focus XP for each session of one day, in start order. Only minutes up to the day's full target pay,
 * so hours past it (and past bedtime) earn nothing. Deterministic: same sessions, same split.
 */
export function allocateFocusXp(sessions: { id: string; start: number; minutes: number }[], fullHours: number) {
  let left = Math.max(0, fullHours * 60);
  const out = new Map<string, number>();
  for (const s of [...sessions].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
    const paid = Math.min(s.minutes, left);
    left -= paid;
    out.set(s.id, sessionXp(paid));
  }
  return out;
}

/** Only this many Epic quests per day pay Epic XP; the rest pay Hard (difficulty is self-rated). */
export const MAX_FULL_EPICS_PER_DAY = 1;
/** A single focus session never counts more than this (a forgotten timer). */
export const MAX_SESSION_MINUTES = 12 * 60;
/** After this long the Focus screen asks "still working?". */
export const STILL_WORKING_MINUTES = 3 * 60;

/**
 * P1-3: the XP a ritual (a habit that isn't core) may pay, chosen in the habit editor. The 4 core habits keep
 * their XP. Capped at 20 so no ritual outweighs the core habits that grade the day; new rituals start at 10.
 */
export const RITUAL_XP_CHOICES = [5, 10, 15, 20];
export const NEW_RITUAL_XP = 10;

/** Minimum versions pay this share of the habit's XP (and keep the streak). */
export const MIN_VERSION_SHARE = 0.5;
/** Deep work counts as its minimum version from this many hours. */
export const WORK_MIN_HOURS = 2;
/** Streak shields: one per this many Good-or-Perfect days in a row, holding at most SHIELD_MAX. */
export const SHIELD_EVERY = 7;
export const SHIELD_MAX = 2;

/** Perfect Day: every core habit, full version. Good Day: at least GOOD_DAY_MIN_CORE core habits (min versions count). */
export const PERFECT_DAY_XP = 60;
export const GOOD_DAY_XP = 25;
export const GOOD_DAY_MIN_CORE = 3;
export const WORKDAY_BONUS_XP = 30; // reached the day's full deep-work target

export type DayGrade = 'perfect' | 'good' | 'none';
/** `full` = core habits done in their full version, `any` = done in any version (full or min). */
export function dayGrade(coreTotal: number, full: number, any: number): DayGrade {
  if (coreTotal > 0 && full >= coreTotal) return 'perfect';
  if (coreTotal > 0 && any >= Math.min(GOOD_DAY_MIN_CORE, coreTotal)) return 'good';
  return 'none';
}

/** Weekly scorecard (Mon–Sun): hit `needed` of the four targets for the bonus. */
export const WEEKLY_SCORECARD = { xp: 150, needed: 3, focusHours: 30, exerciseDays: 4, moneyDays: 5, goodDays: 5 };
export interface WeekStats { focusHours: number; exerciseDays: number; moneyDays: number; goodDays: number }
export function weeklyScore(w: WeekStats) {
  const hits = {
    focus: w.focusHours >= WEEKLY_SCORECARD.focusHours,
    exercise: w.exerciseDays >= WEEKLY_SCORECARD.exerciseDays,
    money: w.moneyDays >= WEEKLY_SCORECARD.moneyDays,
    good: w.goodDays >= WEEKLY_SCORECARD.goodDays
  };
  const count = Object.values(hits).filter(Boolean).length;
  return { hits, count, earned: count >= WEEKLY_SCORECARD.needed };
}

/** Streak multiplier for habits: +5% per full week of streak, capped at +50%. */
export const streakMultiplier = (streakDays: number) => 1 + Math.min(0.5, Math.floor(streakDays / 7) * 0.05);

/** Total XP needed to REACH level n (level 1 = 0). Smooth curve: 50 * (n-1)^1.8 */
export const xpForLevel = (n: number) => Math.round(50 * Math.pow(Math.max(0, n - 1), 1.8));

export function levelFromXp(totalXp: number) {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= totalXp) lvl++;
  const base = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  return { level: lvl, into: totalXp - base, needed: next - base, progress: (totalXp - base) / (next - base) };
}

// Classical ranks: from first step to philosopher-king.
const TITLES: [number, string][] = [
  [1, 'Neophyte'], [5, 'Ephebe'], [10, 'Hoplite'], [15, 'Artisan'], [20, 'Strategos'],
  [30, 'Archon'], [40, 'Magnate'], [50, 'Philosopher-King']
];
export const titleForLevel = (lvl: number) => TITLES.filter(([l]) => lvl >= l).pop()![1];

/** Financial XP: reward behaviour, never amounts (so a big paycheck ≠ big XP). */
export const FINANCE_XP = {
  logTransaction: 2,
  logTransactionDailyCap: 20,
  payCardInFull: 50,
  saveDeposit: 25
};

/** Leading indicators of the income engine: reward the actions that build income, not the income itself. */
export const LEAD_XP = { conversation: 15, proposal: 40, 'case-study': 75, stage: 10 } as const;
/** Conversations pay at most this much XP a day (3 conversations). */
export const CONVERSATION_DAILY_CAP_XP = 45;
/** The plan's weekly target: 5 new conversations. */
export const WEEKLY_CONVERSATIONS = 5;

/**
 * Weekly review (P1-4): +50 XP once per Mon–Sun week, and only for a real review (3 wins and 3 quests for next week).
 * Below the scorecard (150) on purpose: the week's outcome is worth more than planning it.
 */
export const REVIEW_XP = 50;
export const REVIEW_WINS = 3;
export const REVIEW_QUESTS = 3;

/**
 * The week a review made on `today` covers (its Monday): on Sunday, the week ending today; on any other day,
 * the last finished week. Only this week's review pays, so old weeks can't be backfilled for XP.
 */
export function reviewWeekFor(today: DateKey): DateKey {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0 = Sunday
  date.setDate(date.getDate() - (dow === 0 ? 6 : dow + 6));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** A review counts (and pays) only with every win written and every quest chosen. */
export const reviewComplete = (wins: string[], questIds: string[]) =>
  wins.filter(w => w.trim()).length >= REVIEW_WINS && new Set(questIds).size >= REVIEW_QUESTS;
