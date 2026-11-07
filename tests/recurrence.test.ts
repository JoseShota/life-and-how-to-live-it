import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, migrateTaskV9, migrateTaskV11, TAX_MONTHLY_RECURRENCE } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { completeTask, ensureTaxQuests, reopenTask, totals } from '../src/game/engine';
import { addPeriod, instanceId, makeRecurrence, nextDue } from '../src/lib/recurrence';
import type { Task } from '../src/db/types';

describe('recurrence math', () => {
  it('adds a period; monthly keeps its anchor day', () => {
    expect(addPeriod('2026-11-07', { every: 'day' })).toBe('2026-11-08');
    expect(addPeriod('2026-12-28', { every: 'week' })).toBe('2027-01-04');
    expect(addPeriod('2027-01-31', { every: 'month', anchorDay: 31 })).toBe('2027-02-28');
    expect(addPeriod('2027-02-28', { every: 'month', anchorDay: 31 })).toBe('2027-03-31');
    expect(addPeriod('2026-12-17', { every: 'month', anchorDay: 17 })).toBe('2027-01-17');
  });
  it('skips missed periods, unless every period must happen', () => {
    const daily = makeRecurrence('day', 's', '2026-11-01');
    expect(nextDue(daily, '2026-11-01', '2026-11-07')).toBe('2026-11-08');
    expect(nextDue(daily, '2026-11-07', '2026-11-07')).toBe('2026-11-08');
    const weekly = makeRecurrence('week', 's', '2026-11-08');
    expect(nextDue(weekly, '2026-11-08', '2026-11-06')).toBe('2026-11-15'); // done early: next week, not this one again
    expect(nextDue(weekly, undefined, '2026-11-06')).toBe('2026-11-13');
    expect(nextDue({ ...TAX_MONTHLY_RECURRENCE }, '2026-11-17', '2027-01-03')).toBe('2026-12-17'); // late tax: still the next month
  });
});

describe('repeating quests', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await seedIfEmpty();
  });
  const make = async (over: Partial<Task> = {}): Promise<Task> => {
    const area = (await db.areas.toArray())[0];
    const t: Task = { id: 'q1', areaId: area.id, title: 'Grade weekly quizzes', difficulty: 2, priority: 2, status: 'todo', createdAt: 1, dueDate: '2026-11-08', recurrence: makeRecurrence('week', 'q1', '2026-11-08'), ...over };
    await db.tasks.add(t);
    return t;
  };

  it('completing creates the next instance once; reopening removes it', async () => {
    const t = await make();
    await completeTask(t);
    const done = (await db.tasks.get('q1'))!;
    const nextId = (await db.tasks.toArray()).find(x => x.id.startsWith('q1@'))!.id;
    const next = (await db.tasks.get(nextId))!;
    expect(next).toMatchObject({ title: 'Grade weekly quizzes', status: 'todo', recurrence: { every: 'week', series: 'q1' } });
    expect(next.dueDate! > '2026-11-08').toBe(true);
    expect(nextId).toBe(instanceId('q1', next.dueDate!));
    await reopenTask(done);
    expect(await db.tasks.get(nextId)).toBeUndefined();
    await completeTask((await db.tasks.get('q1'))!);
    await completeTask((await db.tasks.get('q1'))!); // a double tap never duplicates
    expect((await db.tasks.toArray()).filter(x => x.recurrence?.series === 'q1')).toHaveLength(2);
  });

  it('each instance pays its own quest XP', async () => {
    const t = await make();
    await completeTask(t);
    const next = (await db.tasks.toArray()).find(x => x.id.startsWith('q1@'))!;
    const before = (await totals()).xp;
    await completeTask(next);
    expect((await totals()).xp).toBeGreaterThan(before);
    expect((await db.tasks.toArray()).filter(x => x.recurrence?.series === 'q1')).toHaveLength(3);
  });

  it('reopening keeps a next instance that was already used', async () => {
    const t = await make();
    await completeTask(t);
    const next = (await db.tasks.toArray()).find(x => x.id.startsWith('q1@'))!;
    await db.tasks.update(next.id, { title: 'Grade quizzes + midterm' });
    await reopenTask((await db.tasks.get('q1'))!);
    expect(await db.tasks.get(next.id)).toBeTruthy();
  });

  it('the RESICO declaration is a monthly series with month ids', async () => {
    await ensureTaxQuests('2026-11-07');
    const oct = (await db.tasks.get('tax-m-2026-10'))!;
    expect(oct.recurrence).toMatchObject({ every: 'month', series: 'tax-m', keepMissed: true });
    expect(oct.dueDate).toBe('2026-11-17');
    await completeTask(oct);
    const nov = (await db.tasks.get('tax-m-2026-11'))!;
    expect(nov).toMatchObject({ dueDate: '2026-12-17', status: 'todo', title: 'Declaración mensual RESICO · noviembre 2026' });
    // The app opening next month finds it already there (same id): no duplicate.
    await ensureTaxQuests('2026-12-02');
    expect((await db.tasks.toArray()).filter(x => x.id.startsWith('tax-m-'))).toHaveLength(2);
  });

  it('refreshing the estimate never touches the user\'s own notes', async () => {
    await ensureTaxQuests('2026-11-07');
    const before = (await db.tasks.get('tax-m-2026-10'))!;
    expect(before.autoNotes).toMatch(/^Estimate: ISR /);
    expect(before.notes).toBeUndefined();
    await db.tasks.update('tax-m-2026-10', { notes: 'ask the contador about the IVA in favor' });
    const acc = (await db.accounts.toArray())[0];
    const area = (await db.areas.toArray())[0];
    await db.transactions.add({ id: 'inc', accountId: acc.id, date: '2026-10-20', amount: 10000, kind: 'income', category: 'Freelance', areaId: area.id, createdAt: 0,
      incomeTax: { kind: 'resico', subtotal: 10000, ivaCharged: 1600, isrWithheld: 0, ivaWithheld: 0, clientIsCompany: false } });
    await ensureTaxQuests('2026-11-08');
    const after = (await db.tasks.get('tax-m-2026-10'))!;
    expect(after.notes).toBe('ask the contador about the IVA in favor');
    expect(after.autoNotes).not.toBe(before.autoNotes);
    expect(after.autoNotes).toContain('10,000');
  });

  it('v11 moves the app\'s estimate out of notes, and keeps notes the user wrote', () => {
    const auto = { id: 'tax-m-2026-10', notes: 'Estimate: ISR $0.00 + IVA $0.00 = $0.00 (…)' } as { id: string; notes?: string; autoNotes?: string };
    migrateTaskV11(auto);
    expect(auto).toEqual({ id: 'tax-m-2026-10', autoNotes: 'Estimate: ISR $0.00 + IVA $0.00 = $0.00 (…)' });
    const mine = { id: 'tax-m-2026-09', notes: 'paid with línea de captura 123' } as { id: string; notes?: string; autoNotes?: string };
    migrateTaskV11(mine);
    expect(mine).toEqual({ id: 'tax-m-2026-09', notes: 'paid with línea de captura 123' });
    const annual = { id: 'tax-a-2025', notes: 'Annual return for personas físicas, due in April. RESICO has no personal deductions.' } as { id: string; notes?: string; autoNotes?: string };
    migrateTaskV11(annual);
    expect(annual.notes).toBeUndefined();
    const other = { id: 'q1', notes: 'Estimate: ISR is a word I use' } as { id: string; notes?: string; autoNotes?: string };
    migrateTaskV11(other);
    expect(other.notes).toBe('Estimate: ISR is a word I use');
  });

  it('v9 marks existing tax quests as the monthly series', () => {
    const t = { id: 'tax-m-2026-09' } as { id: string; recurrence?: unknown };
    migrateTaskV9(t);
    expect(t.recurrence).toEqual({ ...TAX_MONTHLY_RECURRENCE });
    const other = { id: 'abc' } as { id: string; recurrence?: unknown };
    migrateTaskV9(other);
    expect(other.recurrence).toBeUndefined();
  });
});
