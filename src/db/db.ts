import Dexie, { type Table } from 'dexie';
import { legacyIcon, ICON_TABLES } from './legacy';
import type {
  Area, Task, Habit, HabitLog, Session, Account, Transaction, Goal,
  Opportunity, Reward, XpEvent, Unlocked, Setting
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
  }
}

export const db = new LifeDB();

export const ALL_TABLES = [
  'areas', 'tasks', 'habits', 'habitLogs', 'sessions', 'accounts', 'transactions',
  'goals', 'opportunities', 'rewards', 'xp', 'unlocked', 'settings'
] as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
