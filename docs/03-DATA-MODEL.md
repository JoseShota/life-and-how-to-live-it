# 03 · Data Model

Source of truth: `src/db/types.ts` (types) and `src/db/db.ts` (Dexie indexes). Keep this file in sync when they change.

## Tables (Dexie v1)

| Table | Key | Indexes | Purpose |
|---|---|---|---|
| `areas` | `id` | `order` | Life/work areas (CIDE, Weaving, Freelance, AI, Video, Writing, Website, Wealth) |
| `tasks` | `id` | `areaId, status, dueDate, priority, completedAt` | Quests |
| `habits` | `id` | `&key` (unique), `order` | Routine items |
| `habitLogs` | `id` = `${habitId}:${date}` | `habitId, date, [habitId+date]` | One row per habit per day |
| `sessions` | `id` | `areaId, date, start` | Focus/work time |
| `accounts` | `id` | `order` | Bank accounts & cards |
| `transactions` | `id` | `accountId, date, kind, areaId, transferId` | Money movements |
| `goals` | `id` | `order` | Wealth goals / milestones |
| `opportunities` | `id` | `status` | Job/client pipeline (incl. the two December opportunities) |
| `rewards` | `id` | — | Reward shop items |
| `xp` | `id` | `date, source, refId, ts` | **Append-only ledger** of XP/coin events |
| `unlocked` | `key` | — | Unlocked achievements |
| `settings` | `key` | — | Key/value: `playerName`, `workTargetHours`, `wakeTime`, `bedTime`, `activeTimer`, `createdAt` |

## Entities (abridged)

```ts
Area        { id, name, short, emoji, color, kind: 'work'|'growth'|'hobby'|'personal',
              weeklyHoursTarget, monetizable, order, archived }
Task        { id, areaId, title, notes?, difficulty: 1..5, priority: 1|2|3, dueDate?, status: 'todo'|'doing'|'done',
              createdAt, completedAt? }
Habit       { id, key, name, emoji, kind: 'check'|'number'|'auto', target?, unit?, xp, core, order, archived }
HabitLog    { id, habitId, date, value, done }
Session     { id, areaId, taskId?, date, start, end, minutes, note? }
Account     { id, name, institution, type: 'debit'|'credit'|'cash'|'savings'|'investment',
              creditLimit?, cutoffDay?, paymentDueDay?, openingBalance, color, archived, order }
Transaction { id, accountId, date, amount (signed MXN), kind: 'income'|'expense'|'transfer', category,
              areaId? (income source), description?, transferId?, createdAt }
Goal        { id, name, emoji, target, current, deadline?, order }
Opportunity { id, title, areaId?, status: 'lead'|'applied'|'interview'|'won'|'lost', monthlyValue,
              probability 0..1, expectedDate?, nextAction?, notes?, createdAt }
Reward      { id, title, emoji, cost, archived }
XpEvent     { id, ts, date, source, refId, xp, coins, label }
```

## Conventions
- **IDs:** `crypto.randomUUID()` via `uid()`.
- **Dates:** `DateKey` = local `YYYY-MM-DD`. Timestamps = epoch ms.
- **Money:** MXN as JS numbers, 2 decimals in the UI. (Phase 5 may move to integer centavos. If so, write a migration.)
- **Credit cards:** `openingBalance` negative = debt when you start tracking. Purchases are negative amounts. Payments are transfers into the card (positive).
- **Soft delete:** MVP uses hard delete. Phase 2 adds `deletedAt` tombstones for sync.

## Ledger `refId` scheme
| Source | refId | Reversible by |
|---|---|---|
| task | `task:<taskId>` | reopen / delete task |
| habit | `habit:<habitId>:<date>` | unchecking habit |
| perfect-day | `perfect:<date>` | any core habit becomes undone |
| workday | `workday:<date>` | deleting sessions below target |
| session | `session:<sessionId>` | deleting session |
| finance | `tx:<txId>`, `goal:<goalId>:<ts>` | deleting transaction |
| achievement | `ach:<key>` | (permanent) |
| reward | `reward:<rewardId>:<ts>` | (permanent; negative coins) |

## Migration recipe (Dexie)
```ts
// db.ts — NEVER modify version(1). Append:
this.version(2).stores({
  tasks: 'id, areaId, status, dueDate, priority, completedAt, updatedAt, parentId' // only tables that change
}).upgrade(async tx => {
  await tx.table('tasks').toCollection().modify(t => { t.updatedAt ??= t.createdAt; });
});
```
Then update `types.ts`, `seed.ts` (if needed), `backup.ts` (`BACKUP_VERSION`), this document, and add a test.
