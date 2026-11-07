// Evaluation simulation (docs/09-EVALUATION.md, section A). Run: npx vite-node scripts/eval-sim.ts
// Throwaway analysis tool: imports the real pure rules and mirrors engine.ts. Not part of the app.
import {
  TASK_XP, coinsFor, sessionXp, PERFECT_DAY_XP, WORKDAY_BONUS_XP, streakMultiplier, levelFromXp, FINANCE_XP
} from '../src/game/rules';

type HabitKey = 'wake' | 'sleep' | 'exercise' | 'clean' | 'intel' | 'work' | 'money';
const HABIT_XP: Record<HabitKey, number> = { wake: 20, sleep: 20, exercise: 25, clean: 10, intel: 15, work: 40, money: 15 };
const CHECK_HABITS: HabitKey[] = ['wake', 'sleep', 'exercise', 'clean', 'intel', 'money'];

interface DayType {
  name: string;
  p: Partial<Record<HabitKey, number>>; // probability each self-reported habit is done
  focusMean: number; focusSd: number;   // hours
  questXp: number[];                    // difficulties completed (as list of XP)
  tx: number;                           // transactions logged
}

const DAY: Record<string, DayType> = {
  ideal:    { name: 'ideal',    p: { wake: 1, sleep: 1, exercise: 1, clean: 1, intel: 1, money: 1 }, focusMean: 8, focusSd: 0, questXp: [35, 35, 15], tx: 5 },
  weekday:  { name: 'realistic weekday', p: { wake: .8, sleep: .7, exercise: .7, clean: .8, intel: .9, money: .7 }, focusMean: 5, focusSd: 1.2, questXp: [35, 15], tx: 3 },
  teaching: { name: 'teaching day', p: { wake: .85, sleep: .7, exercise: .5, clean: .6, intel: .7, money: .6 }, focusMean: 4.5, focusSd: 1, questXp: [15, 15], tx: 4 },
  weekend:  { name: 'weekend', p: { wake: .5, sleep: .8, exercise: .6, clean: .7, intel: .5, money: .5 }, focusMean: 1.5, focusSd: 1, questXp: [15], tx: 3 },
  strong:   { name: 'strong weekday', p: { wake: .6, sleep: .5, exercise: .6, clean: .7, intel: .95, money: .7 }, focusMean: 6, focusSd: 1.5, questXp: [35, 15], tx: 3 },
  workWeekend: { name: 'working weekend', p: { wake: .4, sleep: .7, exercise: .5, clean: .6, intel: .9, money: .5 }, focusMean: 2.5, focusSd: 1.2, questXp: [15], tx: 3 },
  bad:      { name: 'bad-week day', p: { wake: .3, sleep: .4, exercise: .2, clean: .3, intel: .6, money: .3 }, focusMean: 2, focusSd: 1, questXp: [5], tx: 1 }
};

// Deterministic RNG so the report's numbers are reproducible.
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
function gauss(r: () => number) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

type Schedule = (day: number) => DayType; // day 0 = Monday
const schedules: Record<string, Schedule> = {
  'All ideal (7/7)': () => DAY.ideal,
  'Ideal weekdays, real weekends': d => (d % 7 < 5 ? DAY.ideal : DAY.weekend),
  'Realistic (2 teaching days)': d => { const w = d % 7; return w >= 5 ? DAY.weekend : (w === 1 || w === 3) ? DAY.teaching : DAY.weekday; },
  'Realistic + 1 bad week/month': d => { const w = d % 7; if (Math.floor(d / 7) % 4 === 3) return DAY.bad; return w >= 5 ? DAY.weekend : (w === 1 || w === 3) ? DAY.teaching : DAY.weekday; },
  '6 h weekdays, 2.5 h weekends, sleep/exercise shaky': d => (d % 7 < 5 ? DAY.strong : DAY.workWeekend),
  'Bad weeks only': () => DAY.bad
};

interface Rules {
  label: string;
  workTarget: (dow: number, t: DayType) => number;      // hours for the work habit
  fullTarget?: (dow: number, t: DayType) => number;     // hours for the workday bonus (defaults to workTarget)
  core: (dow: number) => HabitKey[];          // what Perfect Day needs
  sessionXp: (minutes: number, minutesBefore: number, dow?: number, t?: DayType) => number;
  perfectXp: number; workdayBonus: number;
  goodDay?: { minDone: number; xp: number };  // partial-credit tier
  workMinHours?: number;                      // deep-work 'min version': counts for Good Day, not Perfect Day
  weekly?: (w: WeekStats) => number;         // weekly scorecard bonus
  leadXpPerWeekday?: number;                  // expected leading-indicator XP per weekday
}
interface WeekStats { focusH: number; exerciseDays: number; moneyDays: number; perfectOrGood: number }

const ALL: HabitKey[] = ['wake', 'sleep', 'exercise', 'clean', 'intel', 'work', 'money'];
const V1: Rules = {
  label: 'v1 (current)',
  workTarget: () => 8,
  core: () => ALL,
  sessionXp: m => sessionXp(m),
  perfectXp: PERFECT_DAY_XP, workdayBonus: WORKDAY_BONUS_XP
};
// v2 "Option B" from the report: weekday 4 h deep-work target, weekend rest target 0 (habit auto-done if
// no work planned), 5 core habits, focus XP tapers after 4 h and stops at 6 h, Good Day tier, weekly scorecard.
// v2 as approved (2026-11-06): weekday 6 h done / 8 h full, weekend 4 h done / 6 h full, focus XP 20/h
// pro-rata up to the full target and nothing after, 4 core habits, Good Day tier, weekly scorecard.
const V2: Rules = {
  label: 'v2 (approved)',
  workTarget: dow => (dow < 5 ? 6 : 4),
  fullTarget: dow => (dow < 5 ? 8 : 6),
  core: () => ['sleep', 'exercise', 'work', 'money'],
  sessionXp: (m, before, dow = 0) => {
    const cap = (dow < 5 ? 8 : 6) * 60;
    return Math.floor(Math.max(0, Math.min(before + m, cap) - before) / 3);
  },
  perfectXp: 60, workdayBonus: 30,
  goodDay: { minDone: 3, xp: 25 },
  workMinHours: 2,
  weekly: w => {
    let hits = 0;
    if (w.focusH >= 30) hits++;
    if (w.exerciseDays >= 4) hits++;
    if (w.moneyDays >= 5) hits++;
    if (w.perfectOrGood >= 5) hits++;
    return hits >= 3 ? 150 : 0;
  },
  leadXpPerWeekday: 20 // ~1 conversation (15) + share of weekly case study / proposal
};
// Teaching days (approved 2026-11-07, T-3): the simulated teaching days use 4 h done / 5 h full, and focus XP stops
// at 5 h on them. Everything else is v2. The teaching DayType's behaviour (4.5 h mean focus) is unchanged.
const teachFull = (dow: number, t?: DayType) => (t === DAY.teaching ? 5 : dow < 5 ? 8 : 6);
const V3: Rules = {
  ...V2,
  label: 'v2 + teaching days 4/5 (2026-11-07)',
  workTarget: (dow, t) => (t === DAY.teaching ? 4 : dow < 5 ? 6 : 4),
  fullTarget: (dow, t) => teachFull(dow, t),
  sessionXp: (m, before, dow = 0, t) => {
    const cap = teachFull(dow, t) * 60;
    return Math.floor(Math.max(0, Math.min(before + m, cap) - before) / 3);
  }
};

function simulate(sched: Schedule, R: Rules, days = 90, seed = 7) {
  const r = rng(seed);
  const streak: Record<HabitKey, number> = { wake: 0, sleep: 0, exercise: 0, clean: 0, intel: 0, work: 0, money: 0 };
  let xp = 0, coins = 0, perfect = 0, good = 0, workdays = 0, focusMin = 0;
  const bySource: Record<string, number> = {};
  const add = (src: string, x: number, c = coinsFor(x)) => { xp += x; coins += c; bySource[src] = (bySource[src] ?? 0) + x; };
  const levelAt: Record<number, number> = {};
  let week: WeekStats = { focusH: 0, exerciseDays: 0, moneyDays: 0, perfectOrGood: 0 };
  let perfectWeekdays = 0, weekdays = 0, weeklyHits = 0, weeks = 0;
  for (let d = 0; d < days; d++) {
    const t = sched(d); const dow = d % 7;
    const done = new Set<HabitKey>();
    for (const h of CHECK_HABITS) if (r() < (t.p[h] ?? 0)) done.add(h);
    const hours = Math.max(0, Math.min(10, t.focusMean + t.focusSd * gauss(r)));
    const minutes = Math.round(hours * 60 / 15) * 15;
    focusMin += minutes;
    // Focus logged as 50-min sprints (+ remainder), as the timer encourages.
    let before = 0, sx = 0;
    for (let left = minutes; left > 0; left -= 50) { const m = Math.min(50, left); sx += R.sessionXp(m, before, dow, t); before += m; }
    add('focus', sx);
    const target = R.workTarget(dow, t);
    if (hours >= target) done.add('work');
    const full = R.fullTarget ? R.fullTarget(dow, t) : target;
    if (R.fullTarget) {
      if (hours >= target) add('habits', HABIT_XP.work);
      if (full > 0 && hours >= full) { add('workday', R.workdayBonus); workdays++; }
    } else if (hours >= target) { add('workday', R.workdayBonus + HABIT_XP.work); workdays++; }
    for (const h of done) {
      if (h === 'work') { streak.work++; continue; }
      streak[h]++;
      const x = Math.round(HABIT_XP[h] * streakMultiplier(streak[h]));
      add('habits', x);
    }
    for (const h of ALL) if (!done.has(h)) streak[h] = 0;
    for (const q of t.questXp) add('quests', q);
    // log transactions: 2 XP each, capped at 20/day, 1 coin each
    const txXp = Math.min(FINANCE_XP.logTransactionDailyCap, t.tx * FINANCE_XP.logTransaction);
    add('finance', txXp, txXp / 2);
    if (R.leadXpPerWeekday && dow < 5) add('leading', R.leadXpPerWeekday);
    const core = R.core(dow);
    const isPerfect = core.every(h => done.has(h));
    const goodCount = core.filter(h => done.has(h) || (h === 'work' && R.workMinHours !== undefined && hours >= R.workMinHours)).length;
    if (dow < 5) { weekdays++; if (isPerfect) perfectWeekdays++; }
    if (isPerfect) { perfect++; add('perfect', R.perfectXp); }
    else if (R.goodDay && goodCount >= R.goodDay.minDone) { good++; add('good-day', R.goodDay.xp); }
    week.focusH += hours; if (done.has('exercise')) week.exerciseDays++; if (done.has('money')) week.moneyDays++; if (isPerfect || (R.goodDay && goodCount >= R.goodDay.minDone)) week.perfectOrGood++;
    if (dow === 6) { weeks++; if (R.weekly) { const b = R.weekly(week); if (b) weeklyHits++; add('weekly', b); } week = { focusH: 0, exerciseDays: 0, moneyDays: 0, perfectOrGood: 0 }; }
    if ([29, 59, 89].includes(d)) levelAt[d + 1] = levelFromXp(xp).level;
  }
  return { xp, coins, perfect, good, goodRate: good / days, weeklyRate: weeks ? weeklyHits / weeks : 0, workdays, perfectRate: perfect / days, perfectWeekdayRate: perfectWeekdays / weekdays, focusHperDay: focusMin / 60 / days, levelAt, bySource };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
for (const R of [V1, V2, V3]) {
  console.log(`\n### ${R.label}\n`);
  console.log('| Scenario | Focus h/day | Perfect-Day rate (all / weekdays) | Good-Day rate | Weekly bonus hit | Full workdays | XP 90 d | Level d30 / d60 / d90 | Coins / week |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(schedules)) {
    // average over 20 seeds for the stochastic scenarios
    const runs = Array.from({ length: 20 }, (_, i) => simulate(s, R, 90, 11 + i * 97));
    const avg = (f: (x: typeof runs[0]) => number) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
    const lv = (k: number) => Math.round(avg(x => x.levelAt[k]));
    console.log(`| ${name} | ${avg(x => x.focusHperDay).toFixed(1)} | ${pct(avg(x => x.perfectRate))} / ${pct(avg(x => x.perfectWeekdayRate))} | ${R.goodDay ? pct(avg(x => x.goodRate)) : 'n/a'} | ${R.weekly ? pct(avg(x => x.weeklyRate)) : 'n/a'} | ${avg(x => x.workdays).toFixed(0)} | ${Math.round(avg(x => x.xp)).toLocaleString('en')} | ${lv(30)} / ${lv(60)} / ${lv(90)} | ${Math.round(avg(x => x.coins) / 90 * 7)} |`);
  }
  const share = simulate(schedules['Realistic (2 teaching days)'], R, 90, 11);
  const tot = Object.values(share.bySource).reduce((a, b) => a + b, 0);
  console.log(`\nXP share, realistic scenario (${R.label}): ` + Object.entries(share.bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / tot)}`).join(', '));
  const ideal = simulate(schedules['All ideal (7/7)'], R, 1, 1);
  const itot = Object.values(ideal.bySource).reduce((a, b) => a + b, 0);
  console.log(`XP share, one ideal day (${R.label}, ${itot} XP): ` + Object.entries(ideal.bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${pct(v / itot)})`).join(', '));
}

// Probability that a realistic weekday is perfect under v1, analytically: product of habit probabilities * P(focus>=8h).
const pw = DAY.weekday.p; const prodW = (['wake', 'sleep', 'exercise', 'clean', 'intel', 'money'] as HabitKey[]).reduce((a, h) => a * (pw[h] ?? 0), 1);
console.log(`\nAnalytic: P(all 6 self-reported habits on a realistic weekday) = ${pct(prodW)}; even with 8 h guaranteed, Perfect-Day rate caps there.`);
const p5 = (['wake', 'sleep', 'exercise', 'money'] as HabitKey[]).reduce((a, h) => a * (pw[h] ?? 0), 1);
console.log(`Analytic: P(wake, sleep, exercise, money) on a realistic weekday = ${pct(p5)}.`);

// Exploits: XP obtainable in 5 minutes of tapping, current rules.
console.log('\n### Exploit yield (current rules, ~5 minutes of tapping)');
console.log(`Manual focus entry 09:00-17:00 logged 3x: ${3 * sessionXp(480)} XP + workday ${WORKDAY_BONUS_XP + 40} XP`);
console.log(`Goal "Update" 10 times with +1 MXN each: ${10 * FINANCE_XP.saveDeposit} XP`);
console.log(`1 MXN "card payment" to a card with 0 debt, 10 times: ${10 * FINANCE_XP.payCardInFull} XP (no daily cap)`);
console.log(`Create + complete 10 Epic quests: ${10 * TASK_XP[5]} XP`);
const exploitCoins = coinsFor(3 * sessionXp(480) + 100 + 250 + 500 + 2000);
console.log(`Coins from those: ${exploitCoins} dr = ${Math.floor(exploitCoins / 60)} "Fancy coffee" rewards (60 dr) or ${(exploitCoins / 1000).toFixed(1)} "Full day off" (1,000 dr)`);
