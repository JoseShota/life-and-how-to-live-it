import Dexie, { type Table } from 'dexie';
import { trackChanges, tagTransaction, OUTBOX, SYNC_STATE, type OutboxEntry, type SyncStateRow } from '@/sync/track';
import { legacyIcon, ICON_TABLES } from './legacy';
import { DEFAULT_WORK_TARGETS } from '@/game/rules';
import { HABIT_PLANS, EAT_HABIT } from './habitPlans';
import { uid } from '@/lib/util';
import type {
  Area, Task, Habit, HabitLog, Session, Account, Transaction, Goal,
  Opportunity, Reward, XpEvent, Unlocked, Setting, Statement, Installment, PipelineEvent, Review, AreaHours, DayNote, Invoice
} from './types';

/** Every table with user data: what backups hold and what syncs (the two sync tables are device-only). */
export const ALL_TABLES = [
  'areas', 'tasks', 'habits', 'habitLogs', 'sessions', 'accounts', 'transactions',
  'goals', 'opportunities', 'rewards', 'xp', 'unlocked', 'settings', 'statements', 'installments', 'pipelineEvents', 'reviews', 'areaHours',
  'notes', 'invoices'
] as const;

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
  reviews!: Table<Review, string>;
  areaHours!: Table<AreaHours, string>;
  notes!: Table<DayNote, string>;
  invoices!: Table<Invoice, string>;
  /** v13 (device-only): rows changed here and not yet pushed. */
  syncOutbox!: Table<OutboxEntry, string>;
  /** v13 (device-only): sync bookkeeping (clock, cursor, device id, keys). */
  syncState!: Table<SyncStateRow, string>;

  constructor(name = 'life-and-how-to-live-it') {
    // The environment's IndexedDB at creation time (in the browser, the same as Dexie's default). Sync tests give
    // each simulated device its own fake IndexedDB this way.
    super(name, { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange });
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
    // v8: weekly reviews (P1-4), one row per Mon–Sun week keyed by its Monday. A new table: no rows to migrate.
    this.version(8).stores({ reviews: 'id' });
    // v9 (no index changes): repeating quests (P1-1). The RESICO monthly declaration becomes a monthly series.
    this.version(9).stores({}).upgrade(async tx => {
      await tx.table('tasks').toCollection().modify(migrateTaskV9);
    });
    // v10: non-focus hours per area for the real MXN/h (E-10). A new table: no rows to migrate. Expenses may now
    // carry `areaId` too (an index that already exists), so nothing else changes.
    this.version(10).stores({ areaHours: 'id, areaId, date' });
    // v11 (no index changes): the app's tax estimate moves out of a quest's `notes` into `autoNotes`,
    // so refreshing it never overwrites what the user wrote.
    this.version(11).stores({}).upgrade(async tx => {
      await tx.table('tasks').toCollection().modify(migrateTaskV11);
    });
    // v12 (no index changes): deep-work targets gain a teaching-day pair (4 h done, 5 h full). The teaching
    // schedule itself is a new settings key, empty until the user enters it, so nothing else migrates.
    this.version(12).stores({}).upgrade(async tx => {
      const row = await tx.table('settings').get('workTargets');
      if (row) await tx.table('settings').put({ key: 'workTargets', value: migrateWorkTargetsV12(row.value) });
    });
    // v13 (P2 sync): two device-only tables for change tracking, and each XP row's id becomes its refId, so the
    // same reward earned on both devices is one row (never doubled) and an undo is a delete that can sync.
    this.version(13).stores({ [OUTBOX]: 'id', [SYNC_STATE]: 'key' }).upgrade(async tx => {
      const rows = await tx.table('xp').toArray();
      await tx.table('xp').clear();
      await tx.table('xp').bulkAdd(rekeyXpV13(rows));
    });
    // v14: the day's free lines (L-1) and invoices you are owed (P5-7). Two new synced tables: no rows to migrate.
    // Quests may now carry `checklist` and `unsorted`, rewards `unlockKey`: optional fields, no index.
    this.version(14).stores({ notes: 'id, date', invoices: 'id, issuedDate' });
    // Records every change to a synced table in the outbox (src/sync/track.ts).
    this.use(trackChanges(ALL_TABLES));
  }
}

/**
 * v13: XP ids become their refId. Rows that already share a refId (none should) keep every row, oldest first,
 * as `<refId>#2`, `#3`…, so no XP or coins are lost or added by the upgrade. Exported for tests.
 */
export function rekeyXpV13<T extends { id: string; refId: string; ts: number }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  return [...rows].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id)).map(r => {
    const n = (seen.get(r.refId) ?? 0) + 1;
    seen.set(r.refId, n);
    return { ...r, id: n === 1 ? r.refId : `${r.refId}#${n}` };
  });
}

/** v3 habit changes, by stable key. Exported for tests. */
export function migrateHabitV3(h: { key: string; core: boolean; intrinsic?: boolean; name: string; target?: number }) {
  if (['wake', 'clean', 'intel'].includes(h.key)) h.core = false;
  if (['sleep', 'exercise', 'work', 'money'].includes(h.key)) h.core = true;
  if (h.key === 'intel') h.intrinsic = true;
  if (h.key === 'work') { h.name = 'Deep work'; h.target = DEFAULT_WORK_TARGETS.weekday.done; }
}

/** v12: add the teaching pair to stored targets; the user's weekday and weekend numbers stay. Exported for tests. */
export function migrateWorkTargetsV12(v: unknown) {
  const t = (v ?? {}) as Partial<typeof DEFAULT_WORK_TARGETS>;
  return { ...t, teaching: t.teaching ?? { ...DEFAULT_WORK_TARGETS.teaching } };
}

/** The RESICO monthly declaration series: due the 17th, and every month must be filed (no skipping). */
export const TAX_MONTHLY_RECURRENCE = { every: 'month', anchorDay: 17, series: 'tax-m', keepMissed: true } as const;

/** v9: monthly tax quests (`tax-m-<yyyy-mm>`) become a repeating series. Exported for tests. */
export function migrateTaskV9(t: { id: string; recurrence?: unknown }) {
  if (t.id.startsWith('tax-m-') && !t.recurrence) t.recurrence = { ...TAX_MONTHLY_RECURRENCE };
}

/** Text the app itself wrote in tax quests before v11 (the monthly estimate, the annual reminder). */
export const isAppTaxNote = (notes: string) => notes.startsWith('Estimate: ISR ') || notes.startsWith('Annual return for personas físicas');

/**
 * v11: on tax quests, move the app's estimate from `notes` to `autoNotes`. A note the user rewrote stays in
 * `notes` (the estimate comes back into `autoNotes` the next time the app opens). Exported for tests.
 */
export function migrateTaskV11(t: { id: string; notes?: string; autoNotes?: string }) {
  if (!/^tax-[ma]-/.test(t.id) || !t.notes || !isAppTaxNote(t.notes)) return;
  t.autoNotes = t.notes;
  delete t.notes;
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

/**
 * Runs a "create it if it's missing" write as a weak change: if another device already has that row (with real
 * edits), its version wins when they sync, instead of this fresh default overwriting it. Inside an existing
 * transaction it can't tag only this write, so it runs as a normal write there.
 */
export async function weakly<T>(fn: () => Promise<T>): Promise<T> {
  if (Dexie.currentTransaction) return fn();
  return db.transaction('rw', ALL_TABLES.map(t => db.table(t)), () => {
    tagTransaction(Dexie.currentTransaction, 'weak');
    return fn();
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
