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

export interface Account {
  id: ID;
  name: string;
  institution: string;
  type: AccountType;
  /** For credit: positive limit. */
  creditLimit?: number;
  /** Day of month the statement closes (fecha de corte) */
  cutoffDay?: number;
  /** Day of month payment is due (fecha límite de pago) */
  paymentDueDay?: number;
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
  /** For income: which activity produced it (wealth engine) */
  areaId?: ID;
  description?: string;
  /** Both legs of a transfer share this id */
  transferId?: ID;
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
  notes?: string;
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
  | 'session'
  | 'workday'
  | 'finance'
  | 'achievement'
  | 'reward'
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

export interface Unlocked {
  key: string;
  unlockedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}
