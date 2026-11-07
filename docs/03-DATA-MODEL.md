# 03 · Data Model

Source of truth: `src/db/types.ts` (types) and `src/db/db.ts` (Dexie indexes). Keep this file in sync when they change.

## Tables (Dexie v10)

v10: new table `areaHours` (E-10): non-focus hours per area, one-off (`hours` on `date`) or standing (`weekly`: `hours` every week from `date` until `until`). Expenses may now carry `areaId` (an existing index): the activity they're a cost of, or `'shared'` for shared work costs. Settings gain `floorRate` (default 250) and `lastBackupAt`. Backups are `BACKUP_VERSION` 5.

v9 (no index changes): tasks get `recurrence` (`every` day/week/month, `anchorDay` for monthly, `series`, `keepMissed`). Completing a repeating quest creates the next instance with the id `<series>@<due date>`; the RESICO monthly declaration is the series `tax-m` and keeps its `tax-m-<yyyy-mm>` ids. The upgrade marks existing `tax-m-*` quests as that series.

v8: new table `reviews` (P1-4), one row per Mon–Sun week keyed by its Monday: `wins` (3 free-text lines), `nextQuestIds` (3 task ids), `note`. No rows to migrate. Backups are `BACKUP_VERSION` 4.

v7: new table `pipelineEvents` (conversations, proposals, case studies, stage changes); opportunities gain `kind` (`job`, `project`, `retainer`) and `nextActionDate`. Backups are `BACKUP_VERSION` 3.


v6 (no index changes): habits get `minLabel` and `plan`; a new "Eat well" ritual (`eat`). Plans live in `src/db/habitPlans.ts`.

V-6 tax fields (no Dexie version needed, new optional fields only): income transactions can carry `incomeTax` (`kind` resico/salary/none, `subtotal`, `ivaCharged`, `isrWithheld`, `ivaWithheld`, `clientIsCompany`; `amount` stays what landed in the account) and expenses `ivaCreditable`. Settings gain `taxProfile` and `splitPlan` (`savingsPct`, `skillsPct`, `funPct`) and `smartAsked`. RESICO filing quests use deterministic task ids `tax-m-<yyyy-mm>` and `tax-a-<yyyy>`.

v5 (no index changes): accounts get `role` (`operating`, `tax`, `shield`, `invest`, `skills`, `fun`), set by type on upgrade. Fresh installs also get the bucket accounts *Apartado impuestos*, *Escudo · CETES* and *Inversiones*. Settings gain `spendingEstimate`.


v4: new tables `statements` and `installments`; credit accounts get `bank` (preset, e.g. `banorte`) and `dueDaysAfterCutoff` (Banorte: 20); expenses can carry `installmentId` (meses sin intereses). Backups are `BACKUP_VERSION` 2; older backups import with the new tables empty.


v3 (no index changes, economy B): habits `wake`, `clean`, `intel` stop being core; `intel` gets `intrinsic: true` (XP, no coins); the work habit becomes "Deep work"; the `workTargets` setting holds the done/full hours for weekdays and weekends. `HabitLog` gains `min?`.

v2 (no index changes): `areas`, `habits`, `rewards`, `goals` store a hand-drawn glyph name in `icon` instead of an `emoji`. The upgrade and backup import both convert old rows through `src/db/legacy.ts`.

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
| `rewards` | `id` | — | Agora items (custom rewards) |
| `xp` | `id` | `date, source, refId, ts` | **Append-only ledger** of XP/coin events |
| `statements` | `id` | `accountId, cutoffDate, dueDate` | v4: one credit-card statement with the exact amounts (saldo al corte, pago para no generar intereses, pago mínimo) |
| `installments` | `id` | `accountId, txId` | v4: meses sin intereses plans (total, months, first cut-off) |
| `pipelineEvents` | `id` | `date, kind, opportunityId` | v7: leading indicators of the income engine |
| `reviews` | `id` (Monday) | — | v8: the weekly review of one Mon–Sun week |
| `areaHours` | `id` | `areaId, date` | v10: non-focus hours per area (no XP), for the real MXN/h |
| `unlocked` | `key` | — | Unlocked achievements |
| `settings` | `key` | — | Key/value: `playerName`, `workTargets` (v3; replaces `workTargetHours`), `wakeTime`, `bedTime`, `activeTimer`, `createdAt` |

## Entities (abridged)

```ts
Area        { id, name, short, icon, color, kind: 'work'|'growth'|'hobby'|'personal',
              weeklyHoursTarget, monetizable, order, archived }
Task        { id, areaId, title, notes?, difficulty: 1..5, priority: 1|2|3, dueDate?, status: 'todo'|'doing'|'done',
              createdAt, completedAt?, recurrence?: { every: 'day'|'week'|'month', anchorDay?, series, keepMissed? } }
Habit       { id, key, name, icon, kind: 'check'|'number'|'auto', target?, unit?, xp, core, intrinsic?, minLabel?, plan?, order, archived }
HabitLog    { id, habitId, date, value, done, min? }
Session     { id, areaId, taskId?, date, start, end, minutes, note? }
Account     { id, name, institution, type: 'debit'|'credit'|'cash'|'savings'|'investment',
              creditLimit?, cutoffDay?, paymentDueDay? (legacy), bank?, dueDaysAfterCutoff?, role?, openingBalance, color, archived, order }
Transaction { id, accountId, date, amount (signed MXN), kind: 'income'|'expense'|'transfer', category,
              areaId? (income: who earned it; expense: cost of which area, or 'shared'), description?, transferId?, installmentId?, incomeTax?, ivaCreditable?, createdAt }
Statement   { id, accountId, cutoffDate, dueDate, statementBalance, noInterestPayment, minimumPayment, notes?, createdAt }
Installment { id, accountId, description, total, months, firstCutoff, txId?, createdAt }
Goal        { id, name, icon, target, current, deadline?, order }
Opportunity { id, title, areaId?, status: 'lead'|'applied'|'interview'|'won'|'lost', kind?: 'job'|'project'|'retainer', monthlyValue,
              probability 0..1, expectedDate?, nextAction?, nextActionDate?, notes?, createdAt }
PipelineEvent { id, kind: 'conversation'|'proposal'|'case-study'|'stage', opportunityId?, date, note?, createdAt }
AreaHours   { id, areaId, date, hours, weekly?, until?, note?, createdAt }
Review      { id (Monday), weekEnd, wins: string[], nextQuestIds: ID[], note?, createdAt, updatedAt }
Reward      { id, title, icon, cost, archived }
XpEvent     { id, ts, date, source, refId, xp, coins, label }
```

## Conventions
- **IDs:** `crypto.randomUUID()` via `uid()`.
- **Dates:** `DateKey` = local `YYYY-MM-DD`. Timestamps = epoch ms.
- **Money:** MXN as JS numbers, 2 decimals in the UI. (Phase 5 may move to integer centavos. If so, write a migration.)
- **Credit cards:** `openingBalance` negative = debt when you start tracking. Purchases are negative amounts. Payments are transfers into the card (positive). A statement is "paid" when transfers into the card after its cut-off, dated on or before its due date, reach its pago para no generar intereses. A purchase at MSI is recorded at its full amount (accrual) and its plan bills total / months from the first cut-off on or after the purchase date.
- **Soft delete:** MVP uses hard delete. Phase 2 adds `deletedAt` tombstones for sync.

## Ledger `refId` scheme
| Source | refId | Reversible by |
|---|---|---|
| task | `task:<taskId>` (each instance of a repeating quest has its own id, so each pays once) | reopen / delete task |
| habit | `habit:<habitId>:<date>` | unchecking habit |
| perfect-day | `perfect:<date>` | any core habit becomes undone |
| good-day | `good:<date>` | fewer than 3 core habits done, or the day becomes perfect |
| weekly | `week:<monday>` (dated on Sunday) | fewer than 3 of 4 weekly targets |
| workday | `workday:<date>` | sessions drop below the full target |
| session | `session:<sessionId>` | deleting session; `evaluateDay` re-allocates the day's focus XP (nothing past the full target) |
| finance | `tx:<txId>` (first leg for transfers), `goal:<goalId>:<yyyy-mm>` (once per goal per month), `stmt:<statementId>` (statement paid in full on time; re-evaluated by `evaluateStatements`), `save:<legId>` (deposit into the shield or investments, max 4 a month) | deleting transaction (revokes every leg). Editing never changes XP |
| pipeline | `pipe:<eventId>`, `pipe:stage:<oppId>:<status>` (once per stage) | deleting the event / opportunity |
| shield | `shield:earn:<date>` (0 XP; revoked if the 7-day run breaks), `shield:use:<habitId>:<date>` | earn: re-evaluated by `evaluateDay`; use: permanent |
| milestone | `wl:<n>` (wealth level reached) | permanent: spending the shield in an emergency never costs XP |
| achievement | `ach:<key>` | re-locked (and revoked) by `checkAchievements` when its condition becomes false |
| reward | `reward:<rewardId>:<ts>` | (permanent; negative coins) |
| review | `review:<monday>` (once per week; only the current review week pays) | deleting the review, or saving it without 3 wins and 3 quests |

## Migration recipe (Dexie)
```ts
// db.ts — NEVER modify an existing version block. Schema is at v2, so append:
this.version(3).stores({
  tasks: 'id, areaId, status, dueDate, priority, completedAt, updatedAt, parentId' // only tables that change
}).upgrade(async tx => {
  await tx.table('tasks').toCollection().modify(t => { t.updatedAt ??= t.createdAt; });
});
```
Then update `types.ts`, `seed.ts` (if needed), `backup.ts` (`BACKUP_VERSION`), this document, and add a test.
