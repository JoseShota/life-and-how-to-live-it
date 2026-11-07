import Dexie, { type Table } from 'dexie';
import { legacyIcon, ICON_TABLES } from './legacy';
import { DEFAULT_WORK_TARGETS } from '@/game/rules';
import { HABIT_PLANS, EAT_HABIT } from './habitPlans';
import { uid } from '@/lib/util';
import type {
  Area, Task, Habit, HabitLog, Session, Account, Transaction, Goal,
  Opportunity, Reward, XpEvent, Unlocked, Setting, Statement, Installment, PipelineEvent
} from './types';

export class LifeDB extends Dexie {
  areas!: Table<Area, string>;
  tasks!: Table<Task, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  sessions!: Table<Session, string>;
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  goals!: Table<Goal, string>;
  opportunities!: Table<Opportunity, string>;
  rewards!: Table<Reward, string>;
  xp!: Table<XpEvent, string>;
  unlocked!: Table<Unlocked, string>;
  settings!: Table<Setting, string>;
  statements!: Table<Statement, string>;
  installments!: Table<Installment, string>;
  pipelineEvents!: Table<PipelineEvent, string>;

  constructor(name = 'life-and-how-to-live-it') {
    super(name);
    // NEVER edit an existing version block. Add version(N+1) with an upgrade() instead.
    this.version(1).stores({
      areas: 'id, order',
      tasks: 'id, areaId, status, dueDate, priority, completedAt',
      habits: 'id, &key, order',
      habitLogs: 'id, habitId, date, [habitId+date]',
      sessions: 'id, areaId, date, start',
      accounts: 'id, order',
      transactions: 'id, accountId, date, kind, areaId, transferId',
      goals: 'id, order',
      opportunities: 'id, status',
      rewards: 'id',
      xp: 'id, date, source, refId, ts',
      unlocked: 'key',
      settings: 'key'
    });
    // v2: emoji → hand-drawn glyph names (no index changes).
    this.version(2).stores({}).upgrade(async tx => {
      for (const t of ICON_TABLES) await tx.table(t).toCollection().modify(row => legacyIcon(row, t));
    });
    // v3 (economy B, no index changes): 4 core habits (sleep, exercise, deep work, money); wake, clean and intel
    // become rituals; intel pays XP but no coins; deep-work targets move to the `workTargets` setting.
    this.version(3).stores({}).upgrade(async tx => {
      await tx.table('habits').toCollection().modify(migrateHabitV3);
      if (!(await tx.table('settings').get('workTargets'))) await tx.table('settings').put({ key: 'workTargets', value: DEFAULT_WORK_TARGETS });
    });
    // v4: credit-card statements with exact amounts, MSI plans, and bank presets on cards.
    this.version(4).stores({
      statements: 'id, accountId, cutoffDate, dueDate',
      installments: 'id, accountId, txId'
    }).upgrade(async tx => {
      await tx.table('accounts').toCollection().modify(migrateAccountV4);
    });
    // v5 (no index changes): bucket roles on accounts, for wealth levels and the "split it" sheet.
    this.version(5).stores({}).upgrade(async tx => {
      await tx.table('accounts').toCollection().modify(migrateAccountV5);
    });
    // v6 (no index changes): habits get minimum versions and if-then plans; a new "Eat well" ritual.
    this.version(6).stores({}).upgrade(async tx => {
      await tx.table('habits').toCollection().modify((h: { key: string; minLabel?: string; plan?: string }) => {
        const p = HABIT_PLANS[h.key];
        if (p) { h.minLabel ??= p.minLabel; h.plan ??= p.plan; }
      });
      if (!(await tx.table('habits').where('key').equals('eat').count())) await tx.table('habits').add({ ...EAT_HABIT, id: uid() });
    });
    // v7: leading indicators of the income engine (conversations, proposals, case studies, stage changes).
    this.version(7).stores({ pipelineEvents: 'id, date, kind, opportunityId' });
  }
}

/** v3 habit changes, by stable key. Exported for tests. */
export function migrateHabitV3(h: { key: string; core: boolean; intrinsic?: boolean; name: string; target?: number }) {
  if (['wake', 'clean', 'intel'].includes(h.key)) h.core = false;
  if (['sleep', 'exercise', 'work', 'money'].includes(h.key)) h.core = true;
  if (h.key === 'intel') h.intrinsic = true;
  if (h.key === 'work') { h.name = 'Deep work'; h.target = DEFAULT_WORK_TARGETS.weekday.done; }
}

/** v4: credit cards get a bank preset and "due N days after the cut-off". Exported for tests. */
export function migrateAccountV4(a: { type: string; institution: string; cutoffDay?: number; paymentDueDay?: number; bank?: string; dueDaysAfterCutoff?: number }) {
  if (a.type !== 'credit' || a.bank) return;
  a.bank = /banorte/i.test(a.institution) ? 'banorte' : 'other';
  a.dueDaysAfterCutoff = a.cutoffDay && a.paymentDueDay ? ((a.paymentDueDay - a.cutoffDay + 30) % 30) || 20 : 20;
}

/** v5: default bucket role by account type. Exported for tests. */
export function migrateAccountV5(a: { type: string; role?: string }) {
  if (a.role) return;
  a.role = { debit: 'operating', cash: 'operating', savings: 'shield', investment: 'invest' }[a.type];
}

export const db = new LifeDB();

export const ALL_TABLES = [
  'areas', 'tasks', 'habits', 'habitLogs', 'sessions', 'accounts', 'transactions',
  'goals', 'opportunities', 'rewards', 'xp', 'unlocked', 'settings', 'statements', 'installments', 'pipelineEvents'
] as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
