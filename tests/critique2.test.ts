// A-2 laurels and promises, Q-2 steps and inbox, the day log, invoices, statement import.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { ACHIEVEMENTS, ROADS, achievementProgress, checkAchievements, isSteady } from '../src/game/achievements';
import { claimMilestoneReward, claimRef, completeTask, importTransactions, redeem, saveOpportunity, setHabit, spawnNext, totals, undoRedeem } from '../src/game/engine';
import { moneyIncome } from '../src/finance/finance';
import { bossProgress } from '../src/game/season';
import { exportAll, importAll } from '../src/lib/backup';
import type { Opportunity, Task, Transaction } from '../src/db/types';

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await seedIfEmpty();
});
const by = async (k: string) => (await db.habits.where('key').equals(k).first())!;
const day = (i: number) => { const d = new Date(2026, 8, 1 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const unlockedKeys = async () => (await db.unlocked.toArray()).map(u => u.key).sort();
const income = (id: string, date: string, amount: number, category: string, areaId?: string): Transaction =>
  ({ id, accountId: 'seed-account-0', date, amount, kind: 'income', category, areaId, createdAt: 1 });

describe('laurels along the four roads', () => {
  it('every laurel has a road, a unique key and its progress', async () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.key)).size).toBe(ACHIEVEMENTS.length);
    const p = await achievementProgress();
    for (const a of ACHIEVEMENTS) { expect(ROADS.some(r => r.key === a.road), a.key).toBe(true); expect(p[a.key], a.key).toBeDefined(); }
    expect(Object.keys(p).sort()).toEqual(ACHIEVEMENTS.map(a => a.key).sort());
    // The keys users already hold are still there.
    for (const k of ['first-quest', 'quests-50', 'perfect-1', 'perfect-7', 'early-7', 'deep-100', 'workday-5', 'good-30', 'week-1', 'totalero-3', 'ledger-30', 'rainmaker', 'conversations-20', 'first-income']) expect(p[k], k).toBeDefined();
  });

  it('seven days of exercise in a row wins Iron Body I; a gap does not', async () => {
    const ex = await by('exercise');
    for (const i of [0, 1, 2, 4, 5, 6, 7]) await setHabit(ex, day(i), 1);
    expect((await achievementProgress())['exercise-7'].have).toBe(4);
    expect(await unlockedKeys()).not.toContain('exercise-7');
    await setHabit(ex, day(3), 0, true); // a minimum version keeps the run
    expect((await achievementProgress())['exercise-7'].have).toBe(8);
    expect(await unlockedKeys()).toContain('exercise-7');
    expect((await db.xp.get('ach:exercise-7'))?.xp).toBe(100);
  });

  it('steady income is a job or a retainer won, for the laurel and the boss', async () => {
    expect(isSteady({ kind: 'job' })).toBe(true);
    expect(isSteady({ kind: 'retainer' })).toBe(true);
    expect(isSteady({ kind: 'project' })).toBe(false);
    const o: Opportunity = { id: 'o', title: 'Analyst, full time', status: 'interview', kind: 'job', monthlyValue: 30000, probability: 0.5, createdAt: 0 };
    await saveOpportunity(o);
    expect(await unlockedKeys()).not.toContain('rainmaker');
    await saveOpportunity({ ...o, status: 'won' });
    expect(await unlockedKeys()).toContain('rainmaker');
    const part = bossProgress({ today: '2026-12-01', start: '2026-11-10', wonRetainers: 1, shieldMonths: 0, spending: 20000, goodDates: [] })[0];
    expect(part).toMatchObject({ met: true, label: 'Steady income · a job or a retainer' });
  });

  it('money at work: what money earned, against a month of spending', async () => {
    const txs = [income('i1', '2026-11-01', 300, 'Interest'), income('i2', '2026-09-20', 150, 'Investment returns'), income('i3', '2026-06-01', 999, 'Interest'), income('i4', '2026-11-02', 20000, 'Freelance')];
    expect(moneyIncome(txs, '2026-11-10')).toEqual({ ever: 1449, monthly: 150 }); // 450 in the last 90 days
    expect(moneyIncome(txs, '2026-08-01').monthly).toBe(333);
    await db.settings.put({ key: 'spendingEstimate', value: 10000 });
    await db.transactions.bulkAdd([income('i1', day(0), 300, 'Interest')]);
    const today = new Date(); const k = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await db.transactions.add(income('now', k, 450, 'Interest'));
    await checkAchievements();
    expect(await unlockedKeys()).toEqual(expect.arrayContaining(['money-1', 'money-pct-1'])); // 150 a month = 1.5 %
    // A quiet quarter is not an undo: the percentage laurel stays; the first-income one goes with its cause.
    await db.transactions.bulkDelete(['now', 'i1']);
    await checkAchievements();
    const left = await unlockedKeys();
    expect(left).toContain('money-pct-1');
    expect(left).not.toContain('money-1');
  });

  it('three fields: paid in three different areas', async () => {
    await db.transactions.bulkAdd([income('a', day(0), 1, 'Freelance', 'seed-area-0'), income('b', day(0), 1, 'Freelance', 'seed-area-1'), income('c', day(0), 1, 'Freelance', 'seed-area-1')]);
    expect((await achievementProgress())['fields-3'].have).toBe(2);
  });
});

describe('promises: rewards for real milestones', () => {
  it('opens with the milestone, costs nothing, is claimed once and can be undone', async () => {
    await db.rewards.add({ id: 'p', title: 'The good headphones', icon: 'gift', cost: 0, archived: false, unlockKey: 'first-quest' });
    expect(await claimMilestoneReward('p')).toBeNull(); // not reached yet
    expect(await redeem('p')).toBeNull();                // and never for sale
    const t = (await db.tasks.toArray())[0];
    await completeTask(t);
    const before = (await totals()).coins;
    const ref = await claimMilestoneReward('p');
    expect(ref).toBe(claimRef('p'));
    expect((await totals()).coins).toBe(before);
    expect(await claimMilestoneReward('p')).toBeNull();  // once
    await undoRedeem(ref!);
    expect(await claimMilestoneReward('p')).toBe(ref);
  });
  it('a wealth level can be the milestone', async () => {
    await db.rewards.add({ id: 'w', title: 'A weekend away', icon: 'sun', cost: 0, archived: false, unlockKey: 'wl:2' });
    expect(await claimMilestoneReward('w')).toBeNull();
    await db.xp.put({ id: 'wl:2', ts: 1, date: day(0), source: 'milestone', refId: 'wl:2', xp: 250, coins: 50, label: 'Wealth level 2' });
    expect(await claimMilestoneReward('w')).toBe('reward:w:claim');
  });
});

describe('steps, the day log, invoices, import', () => {
  it('a repeating quest takes its steps along, unticked', async () => {
    const t: Task = { id: 'r1', areaId: 'seed-area-0', title: 'Grade quizzes', difficulty: 2, priority: 2, dueDate: '2026-11-13', status: 'todo', createdAt: 1,
      recurrence: { every: 'week', series: 'r1' }, checklist: [{ id: 'a', text: 'Group A', done: true }, { id: 'b', text: 'Group B', done: true }] };
    await db.tasks.add(t);
    const next = await db.tasks.get(await spawnNext(t, '2026-11-13'));
    expect(next?.checklist).toEqual([{ id: 'a', text: 'Group A', done: false }, { id: 'b', text: 'Group B', done: false }]);
  });

  it('notes and invoices are in backups and survive a round trip', async () => {
    await db.notes.add({ id: 'n1', date: '2026-11-10', ts: 5, text: 'lunch with M., talked about the data job' });
    await db.invoices.add({ id: 'v1', client: 'Weaving', amount: 8000, issuedDate: '2026-11-01', createdAt: 1 });
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(backup.version).toBe(6);
    await Promise.all(db.tables.map(t => t.clear()));
    await importAll(backup);
    expect(await db.notes.get('n1')).toMatchObject({ text: 'lunch with M., talked about the data job' });
    expect(await db.invoices.get('v1')).toMatchObject({ amount: 8000 });
    // A backup from before v14 has neither table: it imports with them empty.
    delete backup.data.notes; delete backup.data.invoices; backup.version = 5;
    await importAll(backup);
    expect(await db.notes.count()).toBe(0);
    expect(await db.areas.count()).toBeGreaterThan(0);
  });

  it('imported rows land signed, with kind and category, and pay no XP', async () => {
    const n = await importTransactions('seed-account-0', [
      { date: '2026-11-01', amount: -45, description: 'OXXO', category: 'Food' },
      { date: '2026-11-02', amount: 12000, description: 'NOMINA', category: 'Salary' }
    ]);
    expect(n).toBe(2);
    const rows = (await db.transactions.toArray()).sort((a, b) => a.date.localeCompare(b.date));
    expect(rows.map(r => [r.kind, r.amount, r.category])).toEqual([['expense', -45, 'Food'], ['income', 12000, 'Salary']]);
    expect(await db.xp.where('source').equals('finance').count()).toBe(0);
  });
});
