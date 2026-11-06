import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { completeTask, reopenTask, logSession, rewardGoalProgress, SessionOverlapError } from '../src/game/engine';
import { checkAchievements } from '../src/game/achievements';
import { transferLegs } from '../src/finance/finance';
import { TASK_XP, MAX_SESSION_MINUTES } from '../src/game/rules';
import { uid } from '../src/lib/util';

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await seedIfEmpty();
});

const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };

describe('integrity (V-1)', () => {
  it('refuses a session that overlaps one already logged', async () => {
    const area = (await db.areas.toArray())[0];
    await logSession(area.id, at(9), at(17));
    await expect(logSession(area.id, at(9), at(17))).rejects.toBeInstanceOf(SessionOverlapError);
    await expect(logSession(area.id, at(16), at(18))).rejects.toBeInstanceOf(SessionOverlapError);
    expect(await db.sessions.count()).toBe(1);
    await logSession(area.id, at(17), at(18)); // touching is fine
    expect(await db.sessions.count()).toBe(2);
  });

  it('caps a single session at 12 hours', async () => {
    const area = (await db.areas.toArray())[0];
    const start = at(0);
    await logSession(area.id, start, start + 20 * 3600e3);
    const [s] = await db.sessions.toArray();
    expect(s.minutes).toBe(MAX_SESSION_MINUTES);
  });

  it('only the first Epic of the day pays Epic XP', async () => {
    const area = (await db.areas.toArray())[0];
    const mk = () => ({ id: uid(), areaId: area.id, title: 'big', notes: 'done means shipped', difficulty: 5 as const, priority: 1 as const, status: 'todo' as const, createdAt: Date.now() });
    const a = mk(), b = mk();
    await db.tasks.bulkAdd([a, b]);
    await completeTask(a);
    await completeTask(b);
    expect((await db.xp.where('refId').equals(`task:${a.id}`).first())!.xp).toBe(TASK_XP[5]);
    expect((await db.xp.where('refId').equals(`task:${b.id}`).first())!.xp).toBe(TASK_XP[4]);
  });

  it('re-locks an achievement and revokes its XP when its cause is undone', async () => {
    const area = (await db.areas.toArray())[0];
    const t = { id: uid(), areaId: area.id, title: 'x', difficulty: 2 as const, priority: 1 as const, status: 'todo' as const, createdAt: Date.now() };
    await db.tasks.add(t);
    await completeTask(t);
    expect(await db.unlocked.get('first-quest')).toBeTruthy();
    await reopenTask(t);
    expect(await db.unlocked.get('first-quest')).toBeUndefined();
    expect(await db.xp.where('refId').equals('ach:first-quest').count()).toBe(0);
  });

  it('Bookkeeper counts a transfer once, not once per leg', async () => {
    const [a, b] = await db.accounts.orderBy('order').toArray();
    for (let i = 0; i < 15; i++) {
      await db.transactions.bulkAdd(transferLegs({ fromId: a.id, toId: b.id, amount: 10, date: '2026-11-06', isCardPayment: false, transferId: uid(), ids: [uid(), uid()], createdAt: 1 }));
    }
    await checkAchievements();
    expect(await db.unlocked.get('ledger-30')).toBeUndefined();
  });

  it('goal progress pays once per goal per month', async () => {
    const g = (await db.goals.toArray())[0];
    expect(await rewardGoalProgress(g.id, g.name)).toBe(true);
    expect(await rewardGoalProgress(g.id, g.name)).toBe(false);
    expect(await db.xp.where('source').equals('finance').count()).toBe(1);
  });
});
