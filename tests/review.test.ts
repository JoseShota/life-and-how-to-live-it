import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { saveReview, deleteReview, totals } from '../src/game/engine';
import { REVIEW_XP, reviewComplete, reviewWeekFor } from '../src/game/rules';
import { hoursByArea, pipelineCounts, weekDays, weekGrades } from '../src/game/review';
import { periodTotals, monthTotals } from '../src/finance/finance';
import type { Area, Transaction, XpEvent } from '../src/db/types';

describe('review week', () => {
  it('Sunday reviews the week ending today; other days the last finished week', () => {
    expect(reviewWeekFor('2026-11-08')).toBe('2026-11-02'); // Sunday
    expect(reviewWeekFor('2026-11-09')).toBe('2026-11-02'); // Monday after
    expect(reviewWeekFor('2026-11-14')).toBe('2026-11-02'); // Saturday: still last week
    expect(reviewWeekFor('2026-11-15')).toBe('2026-11-09'); // next Sunday
    expect(reviewWeekFor('2027-01-03')).toBe('2026-12-28'); // across a year
  });
  it('only a full review counts', () => {
    expect(reviewComplete(['a', 'b', 'c'], ['1', '2', '3'])).toBe(true);
    expect(reviewComplete(['a', ' ', 'c'], ['1', '2', '3'])).toBe(false);
    expect(reviewComplete(['a', 'b', 'c'], ['1', '1', '2'])).toBe(false);
  });
});

describe('review aggregates', () => {
  const days = weekDays('2026-11-02');
  it('lists the seven days', () => expect(days).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']));
  it('grades days from the ledger', () => {
    const e = (date: string, source: XpEvent['source'], xp: number): XpEvent => ({ id: date + source, ts: 0, date, source, refId: '', xp, coins: xp / 5, label: '' });
    const g = weekGrades(days, [e('2026-11-02', 'perfect-day', 60), e('2026-11-03', 'good-day', 25), e('2026-11-04', 'good-day', 25), e('2026-11-04', 'habit', 20), e('2026-11-09', 'good-day', 25)]);
    expect(g.perfect).toBe(1);
    expect(g.good).toBe(2);
    expect(g.rate).toBeCloseTo(3 / 7);
    expect(g.xp).toBe(130);
  });
  it('hours per area against target, with extra hours', () => {
    const a: Area = { id: 'a', name: 'Freelance', short: 'Free', icon: 'amphora', color: '#000', kind: 'work', weeklyHoursTarget: 10, monetizable: true, order: 0, archived: false };
    const b: Area = { ...a, id: 'b', weeklyHoursTarget: 0 };
    const rows = hoursByArea([a, b], [{ id: 's', areaId: 'a', date: '2026-11-03', start: 0, end: 0, minutes: 300 }, { id: 't', areaId: 'a', date: '2026-11-10', start: 0, end: 0, minutes: 600 }], days, new Map([['a', 1]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ focus: 5, other: 1, hours: 6, share: 0.6 });
  });
  it('counts leading indicators in the week', () => {
    const ev = (kind: 'conversation' | 'proposal' | 'case-study' | 'stage', date = '2026-11-05') => ({ id: kind + date, kind, date, createdAt: 0 });
    expect(pipelineCounts([ev('conversation'), ev('conversation'), ev('proposal'), ev('stage'), ev('conversation', '2026-11-12')], days))
      .toEqual({ conversations: 2, proposals: 1, caseStudies: 0, stageMoves: 1 });
  });
  it('period totals match month totals and respect the range', () => {
    const t = (date: string, amount: number, kind: Transaction['kind'] = amount > 0 ? 'income' : 'expense'): Transaction => ({ id: date + amount, accountId: 'x', date, amount, kind, category: 'Food', createdAt: 0 });
    const txs = [t('2026-11-01', 1000), t('2026-11-03', -300), t('2026-11-08', -100), t('2026-11-09', -999), t('2026-11-04', 500, 'transfer')];
    expect(periodTotals(txs, '2026-11-02', '2026-11-08')).toEqual({ income: 0, expense: 400, net: -400, savingsRate: null });
    expect(monthTotals(txs, '2026-11')).toEqual(periodTotals(txs, '2026-11-01', '2026-11-30'));
  });
});

describe('saveReview', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  const today = '2026-11-08'; // a Sunday
  const monday = '2026-11-02';
  const reviewXp = async () => (await db.xp.where('source').equals('review').toArray()).reduce((s, e) => s + e.xp, 0);

  it('pays once for a complete review of the current week, creates the new quests', async () => {
    const area = (await db.areas.toArray())[0];
    const ids = await saveReview({ monday, wins: ['a', 'b', 'c'], questIds: [], newQuests: [{ title: 'One', areaId: area.id }, { title: 'Two', areaId: area.id }, { title: 'Three', areaId: area.id }] }, today);
    expect(ids).toHaveLength(3);
    const q = (await db.tasks.get(ids[0]))!;
    expect(q).toMatchObject({ title: 'One', priority: 2, dueDate: '2026-11-15', status: 'todo' });
    expect(await reviewXp()).toBe(REVIEW_XP);
    // Editing never pays again.
    await saveReview({ monday, wins: ['a', 'b', 'd'], questIds: ids }, today);
    expect(await reviewXp()).toBe(REVIEW_XP);
    expect((await db.reviews.get(monday))!.wins).toEqual(['a', 'b', 'd']);
    expect(await db.tasks.count()).toBeGreaterThanOrEqual(3);
  });

  it('a draft pays nothing, and emptying a paid review takes the XP back', async () => {
    const ids = (await db.tasks.toArray()).slice(0, 3).map(t => t.id);
    await saveReview({ monday, wins: ['a', '', ''], questIds: ids }, today);
    expect(await reviewXp()).toBe(0);
    await saveReview({ monday, wins: ['a', 'b', 'c'], questIds: ids }, today);
    expect(await reviewXp()).toBe(REVIEW_XP);
    await saveReview({ monday, wins: ['a', 'b', ''], questIds: ids }, today);
    expect(await reviewXp()).toBe(0);
  });

  it('old weeks can be saved but never pay; deleting revokes', async () => {
    const tasks = await db.tasks.toArray();
    const ids = tasks.slice(0, 3).map(t => t.id);
    await saveReview({ monday: '2026-10-26', wins: ['a', 'b', 'c'], questIds: ids }, today);
    expect(await reviewXp()).toBe(0);
    expect(await db.reviews.get('2026-10-26')).toBeTruthy();
    await saveReview({ monday, wins: ['a', 'b', 'c'], questIds: ids }, today);
    const before = (await totals()).xp;
    await deleteReview(monday);
    expect((await totals()).xp).toBe(before - REVIEW_XP);
    expect(await db.reviews.get(monday)).toBeUndefined();
  });

  it('a chosen "Someday" quest moves up to "This week"', async () => {
    const tasks = await db.tasks.toArray();
    await db.tasks.update(tasks[0].id, { priority: 3 });
    await saveReview({ monday, wins: ['a', 'b', 'c'], questIds: tasks.slice(0, 3).map(t => t.id) }, today);
    expect((await db.tasks.get(tasks[0].id))!.priority).toBe(2);
  });
});
