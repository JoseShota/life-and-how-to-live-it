import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { transfer, ensureTaxQuests, deleteTransaction, SAVE_DEPOSITS_PER_MONTH } from '../src/game/engine';
import { invoiceFromSubtotal } from '../src/finance/tax';

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await seedIfEmpty();
});

describe('split it and RESICO quests (db)', () => {
  it('deposits into the shield pay savings XP at most 4 times a month, and deleting one takes it back', async () => {
    const accs = await db.accounts.toArray();
    const debit = accs.find(a => a.type === 'debit')!, shield = accs.find(a => a.role === 'shield')!;
    const first = await transfer(debit.id, shield.id, 500, '2026-11-02');
    for (let i = 0; i < 5; i++) await transfer(debit.id, shield.id, 500, '2026-11-03');
    expect(await db.xp.filter(e => e.refId.startsWith('save:')).count()).toBe(SAVE_DEPOSITS_PER_MONTH);
    await deleteTransaction((await db.transactions.get(first![0]))!);
    expect(await db.xp.filter(e => e.refId.startsWith('save:')).count()).toBe(SAVE_DEPOSITS_PER_MONTH - 1);
  });

  it('creates last month\'s declaration quest once, due the 17th, with the estimate in its notes', async () => {
    const debit = (await db.accounts.toArray()).find(a => a.type === 'debit')!;
    const { deposit, ...incomeTax } = invoiceFromSubtotal(30_000, true, true);
    await db.transactions.add({ id: 'i', accountId: debit.id, date: '2026-10-10', amount: deposit, kind: 'income', category: 'Freelance', incomeTax, createdAt: 0 });
    await ensureTaxQuests('2026-11-06');
    await ensureTaxQuests('2026-11-07');
    const q = await db.tasks.get('tax-m-2026-10');
    expect(q).toMatchObject({ dueDate: '2026-11-17', status: 'todo' });
    expect(q!.title).toContain('octubre 2026');
    // ISR 1.1 % of 30,000 = 330, but 375 was withheld → 0 due; IVA 4,800 charged − 3,200 withheld = 1,600.
    expect(q!.notes).toContain('ISR $0.00 + IVA $1,600.00');
    expect(await db.tasks.filter(t => t.id.startsWith('tax-')).count()).toBe(1);
  });

  it('in April it also creates the annual return quest', async () => {
    await ensureTaxQuests('2027-04-03');
    expect(await db.tasks.get('tax-a-2026')).toMatchObject({ dueDate: '2027-04-30' });
  });

  it('no RESICO quests when the regime is not tracked', async () => {
    await db.settings.put({ key: 'taxProfile', value: { regime: 'none' } });
    await ensureTaxQuests('2026-11-06');
    expect(await db.tasks.filter(t => t.id.startsWith('tax-')).count()).toBe(0);
  });
});
