// RESICO filing quests (v6). Kept apart from engine.ts because ensureTaxQuests runs at startup: the entry chunk
// only needs this and the tax tables, not the whole engine (P1-9 bundle budget).
import { db, TAX_MONTHLY_RECURRENCE, weakly } from '@/db/db';
import type { Task } from '@/db/types';
import { DEFAULT_TAX_PROFILE, monthTax, monthlyDueDate, type TaxProfile } from '@/finance/tax';
import { dateKey, mxn, parseKey } from '@/lib/util';

export async function getTaxProfile(): Promise<TaxProfile> {
  return { ...DEFAULT_TAX_PROFILE, ...((await db.settings.get('taxProfile'))?.value as Partial<TaxProfile> | undefined) };
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export async function taxArea() {
  const areas = await db.areas.toArray();
  return areas.find(a => a.short === 'Wealth') ?? areas[areas.length - 1];
}

async function taxNotes(month: string) {
  const m = monthTax(await db.transactions.where('date').startsWith(month).toArray(), month);
  return `Estimate: ISR ${mxn(m.isrDue, 2)} + IVA ${mxn(m.ivaDue, 2)} = ${mxn(m.totalDue, 2)} (income collected ${mxn(m.base, 2)} at ${(m.rate * 100).toFixed(2)} %). File even if it's zero. Pay from the tax reserve.`;
}

/** The monthly declaration quest for `month` (YYYY-MM): due the 17th of the next month, part of the monthly series. */
export async function taxMonthQuest(month: string, areaId: string): Promise<Task> {
  const [y, mo] = month.split('-').map(Number);
  return {
    id: `tax-m-${month}`, areaId, difficulty: 2, priority: 2, status: 'todo', createdAt: Date.now(), dueDate: monthlyDueDate(month),
    title: `Declaración mensual RESICO · ${MONTHS_ES[mo - 1]} ${y}`, autoNotes: await taxNotes(month), recurrence: { ...TAX_MONTHLY_RECURRENCE }
  };
}

/**
 * Creates the RESICO filing quests once each: last month's declaration (due the 17th; RESICO files even with zero
 * income) and, in April, last year's annual return. Deterministic ids, never overwritten.
 */
export async function ensureTaxQuests(today = dateKey()) {
  const profile = await getTaxProfile();
  if (profile.regime !== 'resico') return;
  const area = await taxArea();
  if (!area) return;
  const t = parseKey(today);
  const prev = dateKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7);
  // Weak writes: this runs on every device at startup, possibly before it has pulled. A quest the other device
  // already created (or filed) must win over this fresh default, and a refreshed estimate must never carry a
  // stale status back over a newer edit. Every device recomputes the estimate from the synced ledger anyway.
  if (!(await db.tasks.get(`tax-m-${prev}`))) { const q = await taxMonthQuest(prev, area.id); await weakly(() => db.tasks.add(q)); }
  // The series can create a month's quest before the month ends: keep open estimates in step with the ledger.
  // Only `autoNotes` is rewritten; the user's own `notes` are never touched.
  for (const q of await db.tasks.where('status').notEqual('done').filter(x => x.id.startsWith('tax-m-')).toArray()) {
    const autoNotes = await taxNotes(q.id.slice(6));
    if (q.autoNotes !== autoNotes) await weakly(() => db.tasks.update(q.id, { autoNotes }));
  }
  if (t.getMonth() === 3) {
    const year = t.getFullYear() - 1;
    const aid = `tax-a-${year}`;
    if (!(await db.tasks.get(aid))) {
      await weakly(() => db.tasks.add({ id: aid, areaId: area.id, difficulty: 3, priority: 2, status: 'todo', createdAt: Date.now(), dueDate: `${year + 1}-04-30`,
        title: `Declaración anual ${year} (RESICO)`, autoNotes: 'Annual return for personas físicas, due in April. RESICO has no personal deductions.' }));
    }
  }
}
