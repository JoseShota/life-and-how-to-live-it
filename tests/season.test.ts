import { describe, it, expect } from 'vitest';
import { dateKey, parseKey } from '../src/lib/util';
import { SEASON_1_ID, SEASON_PHASES, bossProgress, freshStartFor, mondayOf, previousMonth, seasonStatus, withDismissed, DISMISSED_KEPT } from '../src/game/season';

const s = { id: SEASON_1_ID, start: '2026-11-10' }; // a Tuesday

describe('seasonStatus', () => {
  it('is unset without a valid start date', () => {
    expect(seasonStatus('2026-11-10', null)).toEqual({ state: 'unset' });
    expect(seasonStatus('2026-11-10', { id: SEASON_1_ID })).toEqual({ state: 'unset' });
    expect(seasonStatus('2026-11-10', { id: SEASON_1_ID, start: '2026-02-30' })).toEqual({ state: 'unset' });
    expect(seasonStatus('2026-11-10', { id: SEASON_1_ID, start: 'tomorrow' })).toEqual({ state: 'unset' });
  });
  it('counts down before the start', () => {
    expect(seasonStatus('2026-11-09', s)).toEqual({ state: 'before', start: '2026-11-10', end: '2027-02-07', daysUntil: 1 });
    expect(seasonStatus('2026-11-01', s)).toMatchObject({ state: 'before', daysUntil: 9 });
  });
  it('lasts 90 days, start included', () => {
    expect(seasonStatus('2026-11-10', s)).toMatchObject({ state: 'running', day: 1, week: 1, end: '2027-02-07' });
    expect(seasonStatus('2027-02-07', s)).toMatchObject({ state: 'review', day: 90 });
    expect(seasonStatus('2027-02-08', s)).toEqual({ state: 'after', start: '2026-11-10', end: '2027-02-07' });
  });
  it('weeks follow Mon–Sun, so week 1 is short when the season starts mid-week', () => {
    expect(seasonStatus('2026-11-15', s)).toMatchObject({ week: 1, day: 6 }); // Sunday
    expect(seasonStatus('2026-11-16', s)).toMatchObject({ week: 2, day: 7 }); // Monday
    expect(seasonStatus('2027-01-31', s)).toMatchObject({ state: 'running', week: 12, day: 83 });
    expect(seasonStatus('2027-02-01', s)).toMatchObject({ state: 'review', day: 84 });
  });
  it('maps weeks to the phases of §6', () => {
    const phase = (d: string) => { const r = seasonStatus(d, s); return r.state === 'running' ? r.phase.from : null; };
    expect(phase('2026-11-22')).toBe(1); // week 2
    expect(phase('2026-11-23')).toBe(3); // week 3
    expect(phase('2026-12-07')).toBe(5); // week 5
    expect(phase('2027-01-04')).toBe(9); // week 9
    expect(phase('2027-01-31')).toBe(9); // week 12
  });
  it('the phases cover weeks 1 to 12 without gaps', () => {
    const weeks = SEASON_PHASES.flatMap(p => Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i));
    expect(weeks).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
  it('a Monday start gives 12 full weeks and a 6-day review', () => {
    const m = { id: SEASON_1_ID, start: '2026-11-09' };
    expect(seasonStatus('2027-01-31', m)).toMatchObject({ state: 'running', week: 12, day: 84 });
    expect(seasonStatus('2027-02-01', m)).toMatchObject({ state: 'review', day: 85 });
    expect(seasonStatus('2027-02-06', m)).toMatchObject({ state: 'review', day: 90 });
  });
  it('crosses daylight-saving and year boundaries by calendar day', () => {
    const spring = { id: 'x', start: '2027-03-01' };
    expect(seasonStatus('2027-03-31', spring)).toMatchObject({ day: 31 });
  });
});

describe('dates', () => {
  it('mondayOf', () => {
    expect(mondayOf('2026-11-10')).toBe('2026-11-09');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  });
  it('previousMonth', () => {
    expect(previousMonth('2026-12-01')).toBe('2026-11');
    expect(previousMonth('2027-01-02')).toBe('2026-12');
  });
});

describe('freshStartFor', () => {
  const none = { reviewPaid: true, dismissed: [] as string[] };
  it('Sunday: the review prompt until the review pays', () => {
    expect(freshStartFor('2026-11-15', { reviewPaid: false })).toEqual({ kind: 'sunday-review' });
    expect(freshStartFor('2026-11-15', none)).toBeNull();
  });
  it('Monday: the new-week banner until dismissed', () => {
    expect(freshStartFor('2026-11-16', none)).toEqual({ kind: 'monday', key: 'week:2026-11-16' });
    expect(freshStartFor('2026-11-16', { reviewPaid: false, dismissed: ['week:2026-11-16'] })).toBeNull();
    expect(freshStartFor('2026-11-17', none)).toBeNull();
  });
  it('first days of the month, until dismissed', () => {
    expect(freshStartFor('2026-12-02', none)).toEqual({ kind: 'month', key: 'month:2026-12', month: '2026-11' });
    expect(freshStartFor('2026-12-03', none)).toMatchObject({ kind: 'month' });
    expect(freshStartFor('2026-12-04', none)).toBeNull();
    expect(freshStartFor('2026-12-03', { ...none, dismissed: ['month:2026-12'] })).toBeNull();
  });
  it('one banner at a time: Monday wins over the month, which comes back the next day', () => {
    // 2027-02-01 is a Monday.
    expect(freshStartFor('2027-02-01', none)).toMatchObject({ kind: 'monday' });
    const closed = withDismissed(['month:2027-01'], 'week:2027-02-01');
    expect(freshStartFor('2027-02-02', { ...none, dismissed: closed })).toMatchObject({ kind: 'month', month: '2027-01' });
    // A Sunday on the 1st: the review first, then the month.
    expect(freshStartFor('2026-11-01', { reviewPaid: false })).toEqual({ kind: 'sunday-review' });
    expect(freshStartFor('2026-11-01', none)).toMatchObject({ kind: 'month', month: '2026-10' });
  });
  it('closing a Monday after the month keeps the month closed', () => {
    let d = withDismissed(null, 'month:2026-03');
    d = withDismissed(d, 'week:2026-03-02');
    expect(freshStartFor('2026-03-03', { ...none, dismissed: d })).toBeNull();
  });
  it('the dismissed list stays short and has no repeats', () => {
    let d: string[] = [];
    for (let i = 0; i < 10; i++) d = withDismissed(d, `week:${i}`);
    d = withDismissed(d, 'week:9');
    expect(d).toHaveLength(DISMISSED_KEPT);
    expect(d[0]).toBe('week:9');
    expect(new Set(d).size).toBe(d.length);
  });
});

describe('sync', () => {
  it('the season and the dismissed banners sync, so both devices agree', async () => {
    const { LOCAL_SETTINGS } = await import('../src/sync/track');
    expect(LOCAL_SETTINGS).not.toContain('season');
    expect(LOCAL_SETTINGS).not.toContain('freshStartDismissed');
  });
});

describe('bossProgress', () => {
  const base = { start: '2026-11-10', wonRetainers: 0, shieldMonths: 0.4, spending: 20000, goodDates: [] as string[] };
  const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => { const d = parseKey(from); d.setDate(d.getDate() + i); return dateKey(d); });
  const part = (p: ReturnType<typeof bossProgress>, k: string) => p.find(x => x.key === k)!;

  it('the first day: nothing counted yet', () => {
    const p = bossProgress({ ...base, today: '2026-11-10' });
    expect(part(p, 'rate')).toMatchObject({ met: false, progress: 0, detail: 'Starts counting after the first full day' });
    expect(part(p, 'retainer')).toMatchObject({ met: false, progress: 0 });
    expect(part(p, 'shield')).toMatchObject({ met: false, progress: 0.4 });
    expect(part(p, 'shield').detail).toContain('0.4 of 1 month');
  });
  it('counts complete days since the start, never before it, never today', () => {
    const p = bossProgress({ ...base, today: '2026-11-15', goodDates: ['2026-11-08', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-15'] });
    expect(part(p, 'rate').detail).toBe('3 of 5 days (60 %) · 5 of 30 days so far');
    expect(part(p, 'rate').met).toBe(false); // not 30 days yet
    expect(part(p, 'rate').progress).toBeCloseTo(1);
  });
  it('after 30 days, the last 30 complete days decide', () => {
    const today = '2026-12-20';
    const good = days('2026-11-20', 18); // Nov 20 .. Dec 7: 18 of the 30 days Nov 20 .. Dec 19
    const p = bossProgress({ ...base, today, goodDates: [...good, '2026-11-12'] });
    expect(part(p, 'rate')).toMatchObject({ met: true, detail: '18 of 30 days (60 %) · last 30 days' });
    const q = bossProgress({ ...base, today, goodDates: good.slice(1) });
    expect(part(q, 'rate').met).toBe(false);
  });
  it('retainer and shield from real data', () => {
    const p = bossProgress({ ...base, today: '2026-12-01', wonRetainers: 1, shieldMonths: 1.2 });
    expect(part(p, 'retainer')).toMatchObject({ met: true, progress: 1, detail: 'Won' });
    expect(part(p, 'shield')).toMatchObject({ met: true, progress: 1 });
    const unknown = bossProgress({ ...base, today: '2026-12-01', spending: null, shieldMonths: 0 });
    expect(part(unknown, 'shield')).toMatchObject({ met: false, progress: 0, detail: 'Needs a month of logged spending, or a spending estimate' });
    const negative = bossProgress({ ...base, today: '2026-12-01', shieldMonths: -0.2 });
    expect(part(negative, 'shield').progress).toBe(0);
  });
});
