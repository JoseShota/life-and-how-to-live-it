// Single source of truth for domain types. Keep in sync with docs/03-DATA-MODEL.md.

export type ID = string;
/** Local calendar date, YYYY-MM-DD */
export type DateKey = string;

export type AreaKind = 'work' | 'growth' | 'hobby' | 'personal';

export interface Area {
  id: ID;
  name: string;
  short: string;
  /** Glyph name from src/components/glyphs.ts (was `emoji` before schema v2) */
  icon: string;
  color: string; // hex
  kind: AreaKind;
  /** Hours per week you want to invest here */
  weeklyHoursTarget: number;
  /** Does this area produce income? Used by the wealth engine. */
  monetizable: boolean;
  order: number;
  archived: boolean;
}

export type Difficulty = 1 | 2 | 3 | 4 | 5; // trivial, easy, medium, hard, epic
export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: ID;
  areaId: ID;
  title: string;
  notes?: string;
  difficulty: Difficulty;
  /** 1 = must do today, 2 = this week, 3 = someday */
  priority: 1 | 2 | 3;
  dueDate?: DateKey;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  /** v9: a repeating quest. Completing it creates the next instance. */
  recurrence?: Recurrence;
}

/** v9 (P1-1): how a quest repeats. Every instance of a series carries the same `series` id. */
export interface Recurrence {
  every: 'day' | 'week' | 'month';
  /** Monthly: the day of the month it falls on (clamped to short months, never drifts) */
  anchorDay?: number;
  /** Shared by every instance; next instances get the id `${series}@${dueDate}` */
  series: string;
  /** Every period must happen even if late (the monthly tax declaration); otherwise missed periods are skipped */
  keepMissed?: boolean;
}

export type HabitKind = 'check' | 'number' | 'auto';

export interface Habit {
  id: ID;
  key: string; // stable key, e.g. 'wake', 'sleep'
  name: string;
  /** Glyph name from src/components/glyphs.ts (was `emoji` before schema v2) */
  icon: string;
  kind: HabitKind;
  /** For 'number' habits (e.g. sleep hours) or 'auto' (work hours) */
  target?: number;
  unit?: string;
  xp: number;
  /** Core habits count towards a Perfect Day */
  core: boolean;
  /** Already enjoyed for its own sake (e.g. reading the news): XP as feedback, but no coins (overjustification). */
  intrinsic?: boolean;
  /** The smallest version that still counts (Tiny Habits): keeps the streak, half XP, counts for a Good Day. */
  minLabel?: string;
  /** Implementation intention: "When X, I will Y." */
  plan?: string;
  order: number;
  archived: boolean;
}

export interface HabitLog {
  id: ID; // `${habitId}:${date}`
  habitId: ID;
  date: DateKey;
  value: number; // 1/0 for check, numeric otherwise
  done: boolean;
  /** Done in its minimum version: keeps the streak and counts for a Good Day, never a Perfect Day. */
  min?: boolean;
}

export interface Session {
  id: ID;
  areaId: ID;
  taskId?: ID;
  date: DateKey;
  start: number;
  end: number;
  minutes: number;
  note?: string;
}

export type AccountType = 'debit' | 'credit' | 'cash' | 'savings' | 'investment';
/** v5: what an account is for in the plan's buckets (pay yourself first). */
export type AccountRole = 'operating' | 'tax' | 'shield' | 'invest' | 'skills' | 'fun';
/** Bank presets carry rules like "payment due N days after the cut-off" (see BANKS in finance.ts). */
export type BankKey = 'banorte' | 'other';

export interface Account {
  id: ID;
  name: string;
  institution: string;
  type: AccountType;
  /** For credit: positive limit. */
  creditLimit?: number;
  /** Day of month the statement closes (fecha de corte) */
  cutoffDay?: number;
  /** Day of month payment is due (fecha límite de pago). Legacy: v4+ derives the due date from the cut-off. */
  paymentDueDay?: number;
  /** v4: bank preset for credit cards. */
  bank?: BankKey;
  /** v4: days from the cut-off to the payment due date (Banorte: 20). */
  dueDaysAfterCutoff?: number;
  /** v5: bucket role (shield = emergency fund, invest = long-term investments, tax = tax reserve…) */
  role?: AccountRole;
  openingBalance: number; // credit: negative = debt
  color: string;
  archived: boolean;
  order: number;
}

export type TxKind = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: ID;
  accountId: ID;
  date: DateKey;
  /** Signed: + money in, - money out (for credit cards, - adds debt) */
  amount: number;
  kind: TxKind;
  category: string;
  /** Income: which activity produced it. Expense (E-10): which activity it's a cost of, or SHARED_WORK_AREA. */
  areaId?: ID;
  description?: string;
  /** Both legs of a transfer share this id */
  transferId?: ID;
  /** v4: a credit-card purchase at meses sin intereses links to its Installment plan */
  installmentId?: ID;
  /** v6: income only. How it's taxed (CFDI amounts). `amount` is what actually landed in the account. */
  incomeTax?: IncomeTax;
  /** v6: expense only. IVA on a business expense with a CFDI, creditable against IVA charged. */
  ivaCreditable?: number;
  createdAt: number;
}

/** v6: how an income is taxed. Amounts in MXN; `subtotal` excludes IVA. */
export type IncomeTaxKind = 'resico' | 'salary' | 'none';
export interface IncomeTax {
  kind: IncomeTaxKind;
  /** Before IVA (RESICO: the base for ISR). Salary: gross pay. */
  subtotal: number;
  /** IVA charged on the invoice (trasladado) */
  ivaCharged: number;
  /** ISR withheld by the client (1.25 % when the client is a persona moral) or by the employer */
  isrWithheld: number;
  /** IVA withheld by the client (two thirds when a persona moral pays for services) */
  ivaWithheld: number;
  clientIsCompany: boolean;
}

/**
 * v4: one credit-card statement (estado de cuenta), with the exact amounts printed on it.
 * Amounts are positive MXN owed.
 */
export interface Statement {
  id: ID;
  accountId: ID;
  /** Fecha de corte */
  cutoffDate: DateKey;
  /** Fecha límite de pago */
  dueDate: DateKey;
  /** Saldo al corte */
  statementBalance: number;
  /** Pago para no generar intereses: what a totalero pays by the due date */
  noInterestPayment: number;
  /** Pago mínimo */
  minimumPayment: number;
  notes?: string;
  createdAt: number;
}

/** v4: a purchase at meses sin intereses (MSI). Each statement bills total / months. */
export interface Installment {
  id: ID;
  accountId: ID;
  description: string;
  total: number;
  months: number;
  /** Cut-off of the first statement that bills an installment */
  firstCutoff: DateKey;
  txId?: ID;
  createdAt: number;
}

export interface Goal {
  id: ID;
  name: string;
  /** Glyph name from src/components/glyphs.ts (was `emoji` before schema v2) */
  icon: string;
  target: number;
  current: number;
  deadline?: DateKey;
  order: number;
}

export type OpportunityStatus = 'lead' | 'applied' | 'interview' | 'won' | 'lost';
/** v7: what kind of income an opportunity would bring. Retainers are the plan's key to steady income. */
export type OpportunityKind = 'job' | 'project' | 'retainer';

export interface Opportunity {
  id: ID;
  title: string;
  areaId?: ID;
  status: OpportunityStatus;
  /** Expected monthly income in MXN */
  monthlyValue: number;
  /** 0..1 */
  probability: number;
  expectedDate?: DateKey;
  nextAction?: string;
  /** v7: when the next action is due; past it, the lead is flagged as stale */
  nextActionDate?: DateKey;
  /** v7 */
  kind?: OpportunityKind;
  notes?: string;
  createdAt: number;
}

/** v7: leading indicators of the income engine (00-MASTER-PLAN.md §4 Level 3). */
export type PipelineEventKind = 'conversation' | 'proposal' | 'case-study' | 'stage';
export interface PipelineEvent {
  id: ID;
  kind: PipelineEventKind;
  opportunityId?: ID;
  date: DateKey;
  note?: string;
  createdAt: number;
}

export interface Reward {
  id: ID;
  title: string;
  /** Glyph name from src/components/glyphs.ts (was `emoji` before schema v2) */
  icon: string;
  cost: number;
  archived: boolean;
}

export type XpSource =
  | 'task'
  | 'habit'
  | 'perfect-day'
  | 'good-day'
  | 'weekly'
  | 'milestone'
  | 'shield'
  | 'pipeline'
  | 'session'
  | 'workday'
  | 'finance'
  | 'achievement'
  | 'reward'
  | 'review'
  | 'manual';

/** Append-only ledger. Level, XP and coins are always DERIVED from this table. */
export interface XpEvent {
  id: ID;
  ts: number;
  date: DateKey;
  source: XpSource;
  /** Reference to the thing that generated it — used to reverse (undo) */
  refId: string;
  xp: number;
  coins: number;
  label: string;
}

/**
 * v10 (E-10): time spent on an area outside focus sessions (admin, sales, commuting, class time).
 * One-off (`hours` on `date`) or standing (`weekly`: `hours` every week from `date`, until `until`). Pays no XP.
 */
export interface AreaHours {
  id: ID;
  areaId: ID;
  date: DateKey;
  hours: number;
  weekly?: boolean;
  until?: DateKey;
  note?: string;
  createdAt: number;
}

/** v8: the Sunday review of one Mon–Sun week (keyed by that Monday). */
export interface Review {
  /** Monday (local) of the reviewed week */
  id: DateKey;
  /** Sunday of the reviewed week */
  weekEnd: DateKey;
  /** Top 3 wins, free text */
  wins: string[];
  /** Next week's top 3 quests (ids in `tasks`) */
  nextQuestIds: ID[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Unlocked {
  key: string;
  unlockedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}
