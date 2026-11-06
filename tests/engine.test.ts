import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { completeTask, reopenTask, setHabit, logSession, totals, redeem } from '../src/game/engine';
import { dateKey, uid } from '../src/lib/util';

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await seedIfEmpty();
});

describe('engine', () => {
  it('completing and reopening a task is reversible', async () => {
    const area = (await db.areas.toArray())[0];
    const task = { id: uid(), areaId: area.id, title: 'x', difficulty: 3 as const, priority: 1 as const, status: 'todo' as const, createdAt: Date.now() };
    await db.tasks.add(task);
    await completeTask(task);
    const t1 = await totals();
    expect(t1.xp).toBeGreaterThanOrEqual(35); // + first-quest achievement
    await reopenTask(task);
    const t2 = await totals();
    // The quest XP and the First Blood achievement it unlocked are both taken back.
    expect(t2.xp).toBe(0);
  });

  it('toggling a habit twice nets zero habit XP', async () => {
    const h = (await db.habits.where('key').equals('exercise').first())!;
    await setHabit(h, dateKey(), 1);
    await setHabit(h, dateKey(), 0);
    expect(await db.xp.where('source').equals('habit').count()).toBe(0);
  });

  it('8h of sessions marks the work habit and awards workday bonus once', async () => {
    const area = (await db.areas.toArray())[0];
    const start = new Date(); start.setHours(8, 0, 0, 0);
    await logSession(area.id, start.getTime(), start.getTime() + 4 * 3600e3);
    await logSession(area.id, start.getTime() + 5 * 3600e3, start.getTime() + 9 * 3600e3);
    expect(await db.xp.where('source').equals('workday').count()).toBe(1);
  });

  it('perfect day awards bonus when all core habits are done', async () => {
    const habits = await db.habits.toArray();
    const today = dateKey();
    const area = (await db.areas.toArray())[0];
    const start = new Date(); start.setHours(8, 0, 0, 0);
    await logSession(area.id, start.getTime(), start.getTime() + 8 * 3600e3);
    for (const h of habits.filter(x => x.kind !== 'auto')) await setHabit(h, today, h.kind === 'number' ? 8 : 1);
    expect(await db.xp.where('refId').equals(`perfect:${today}`).count()).toBe(1);
  });

  it('cannot redeem a reward without coins', async () => {
    const r = (await db.rewards.toArray())[0];
    expect(await redeem(r.id)).toBe(false);
  });
});
