// PURE wealth-level logic: the plan's phases (00-MASTER-PLAN.md §4) computed from real data. No I/O.
import type { Account, Statement, Transaction } from '@/db/types';
import { dateKey, parseKey } from '@/lib/util';
import { balanceOf, monthTotals, statementStatus, totaleroStreak } from './finance';

export interface WealthLevelDef { n: number; key: string; name: string; xp: number; unlock: string }

export const WEALTH_LEVELS: WealthLevelDef[] = [
  { n: 1, key: 'bleeding', name: 'Stop the bleeding', xp: 150, unlock: 'The shield phase: every peso you save now builds your emergency fund' },
  { n: 2, key: 'shield-1', name: 'Shield I · 1 month', xp: 250, unlock: 'A month of breathing room. Keep filling the shield toward 3 months' },
  { n: 3, key: 'compound-starter', name: 'Compound · starter (3-month shield)', xp: 400, unlock: 'Investing opens: 25 % of the savings bucket goes to investments, the rest keeps filling the shield' },
  { n: 4, key: 'fortress', name: 'Fortress (6-month shield)', xp: 600, unlock: 'Full investing: the whole savings bucket goes to long-term investments every month' },
  { n: 5, key: 'first-million', name: 'First million invested', xp: 1000, unlock: 'Season of compounding. Next stop: 10 M' }
];

/** Requirements, as the user sees them. */
export const LEVEL_RULES = {
  loggingDays: 20,         // days with at least one transaction in the last 30
  shieldMonths: { 2: 1, 3: 3, 4: 6 } as Record<number, number>,
  fortressTotalero: 3,     // statements paid in full in a row
  firstMillion: 1_000_000
};

/** Share of the savings bucket that goes to investments: by the highest level reached AND today's shield. */
export function investShare(reached: number, shieldMonths: number) {
  if (reached >= 4 && shieldMonths >= LEVEL_RULES.shieldMonths[4]) return 1;
  if (reached >= 3 && shieldMonths >= LEVEL_RULES.shieldMonths[3]) return 0.25;
  return 0;
}

const monthKey = (d: Date) => dateKey(d).slice(0, 7);

/**
 * Median monthly spending over the last 3 complete months that have expenses (null with no full month of data).
 * A month only counts if logging had started by its first day: a half-logged first month would understate spending
 * and make the shield look bigger than it is.
 */
export function monthlySpending(txs: Transaction[], today = dateKey()) {
  const t = parseKey(today);
  const first = txs.reduce((m, x) => (x.date < m ? x.date : m), '9999-12-31');
  const months = [1, 2, 3].map(i => monthKey(new Date(t.getFullYear(), t.getMonth() - i, 1))).filter(m => `${m}-01` >= first);
  const totals = months.map(m => monthTotals(txs, m).expense).filter(x => x > 0).sort((a, b) => a - b);
  if (!totals.length) return { median: null as number | null, months: 0 };
  const mid = Math.floor(totals.length / 2);
  const median = totals.length % 2 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2;
  return { median: Math.round(median), months: totals.length };
}

export interface WealthInput {
  accounts: Account[];
  txs: Transaction[];
  statements: Statement[];
  /** Manual monthly spending estimate, used until there's a full month of data */
  spendingEstimate?: number;
  today?: string;
}

export interface Requirement { label: string; met: boolean; progress: number; detail: string }

export function wealthSnapshot(i: WealthInput) {
  const today = i.today ?? dateKey();
  const active = i.accounts.filter(a => !a.archived);
  const sum = (role: string) => active.filter(a => a.role === role).reduce((s, a) => s + balanceOf(a, i.txs), 0);
  const shield = sum('shield'), invested = sum('invest');
  const spend = monthlySpending(i.txs, today);
  const spending = spend.median ?? (i.spendingEstimate && i.spendingEstimate > 0 ? i.spendingEstimate : null);
  const shieldMonths = spending ? shield / spending : 0;

  const t = parseKey(today);
  const since = dateKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 29));
  const loggingDays = new Set(i.txs.filter(x => x.date >= since && x.date <= today).map(x => x.date)).size;
  const cards = active.filter(a => a.type === 'credit');
  const cardsConfigured = cards.length > 0 && cards.every(a => (a.creditLimit ?? 0) > 0 && !!a.cutoffDay);
  const totalero = totaleroStreak(active, i.txs, i.statements, today);
  const since90 = dateKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 90));
  const byId = new Map(active.map(a => [a.id, a]));
  const lateRecently = i.statements.some(s => s.dueDate >= since90 && byId.has(s.accountId) && statementStatus(byId.get(s.accountId)!, i.txs, s, today).state === 'late');

  const shieldReq = (months: number): Requirement => ({
    label: `Emergency fund ≥ ${months} month${months > 1 ? 's' : ''} of spending`,
    met: !!spending && shieldMonths >= months,
    progress: spending ? Math.min(1, shieldMonths / months) : 0,
    detail: spending ? `${shieldMonths.toFixed(1)} of ${months} months (spending ≈ ${Math.round(spending)}/month)` : 'Needs a month of logged spending, or a spending estimate'
  });
  const requirements: Record<number, Requirement[]> = {
    1: [
      { label: 'All credit cards set up (limit and cut-off day)', met: cardsConfigured, progress: cardsConfigured ? 1 : 0, detail: cardsConfigured ? 'done' : 'Treasury, pencil on each card' },
      { label: `Money logged on ${LEVEL_RULES.loggingDays} of the last 30 days`, met: loggingDays >= LEVEL_RULES.loggingDays, progress: Math.min(1, loggingDays / LEVEL_RULES.loggingDays), detail: `${loggingDays} days` },
      { label: 'A card statement paid in full on time', met: totalero >= 1, progress: totalero >= 1 ? 1 : 0, detail: totalero >= 1 ? `${totalero} in a row` : 'enter a statement and pay its pago para no generar intereses' },
      { label: 'No late statement in the last 90 days', met: !lateRecently, progress: lateRecently ? 0 : 1, detail: lateRecently ? 'a statement was paid late' : 'clean' }
    ],
    2: [shieldReq(1)],
    3: [shieldReq(3)],
    4: [shieldReq(6), { label: `${LEVEL_RULES.fortressTotalero} statements in a row paid in full`, met: totalero >= LEVEL_RULES.fortressTotalero, progress: Math.min(1, totalero / LEVEL_RULES.fortressTotalero), detail: `${totalero} in a row` }],
    5: [{ label: 'Invested ≥ 1,000,000 MXN', met: invested >= LEVEL_RULES.firstMillion, progress: Math.min(1, Math.max(0, invested) / LEVEL_RULES.firstMillion), detail: `${Math.round(invested)} invested` }]
  };
  const qualifies = (n: number) => requirements[n].every(r => r.met);
  return { shield, invested, spending, spendingMonths: spend.months, shieldMonths, loggingDays, cardsConfigured, totalero, lateRecently, requirements, qualifies };
}

/** Levels to newly award, in order: each needs the one before it reached (milestones are never taken back). */
export function levelsToAward(reached: number, qualifies: (n: number) => boolean) {
  const out: number[] = [];
  let r = reached;
  while (r < WEALTH_LEVELS.length && qualifies(r + 1)) { r++; out.push(r); }
  return out;
}
