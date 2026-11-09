# 03 · Data Model

Source of truth: `src/db/types.ts` (types) and `src/db/db.ts` (Dexie indexes). Keep this file in sync when they change.

## Tables (Dexie v13)

P1-3 habit editor (2026-11-09, no schema change): habits you add get a random `id` and `key` = `custom-<id>`, so two devices adding habits never clash on the unique `key`; they are `kind: 'check'`, `core: false`. Reordering writes only the rows whose `order` changes (ties sort by name). A habit is deleted only if it was added by you and has no logs; otherwise it is archived (`archived: true`), and its logs and XP stay.

v13 (P2 sync groundwork, 2026-11-07): two **device-only** tables, `syncOutbox` (key `id` = `<table>|<key>`: one entry per row changed here and not yet pushed, with its clock `hlc`; 0 = a weak change) and `syncState` (key/value: the clock, and later the cursor, device id and keys). Neither is in backups or synced. **XP ids become their `refId`** (`award()` writes `id = refId` with `put`), so the same reward earned on two devices is one row and an undo is a delete that can sync. The upgrade re-keys every ledger row; rows that already shared a refId all survive as `<refId>#2`, `#3`… so no XP or coin changes (`rekeyXpV13`, also applied when importing an older backup). Fresh installs seed fixed ids (`seed-area-0`, `seed-habit-sleep`, `seed-account-0`…). Backups are still `BACKUP_VERSION` 5 (same shape).

v12 (no index changes): teaching days (2026-11-07). The `workTargets` setting gains `teaching` (`{ done: 4, full: 5 }`); the upgrade adds it when missing and keeps the user's weekday and weekend numbers (reads also fill missing pairs, so an older backup restores safely). A new setting `teachingSchedule` (`TeachingSchedule` in `src/game/rules.ts`: `days` as JS weekdays, `leave`, optional `arrive`, `classStart`, `classEnd`, `homeBy` as local `HH:MM`, `semesterStart`, `semesterEnd`, `areaId`) is absent by default and entered in Control; it changes nothing until every field is valid. Its hours are **not stored**: `scheduleAreaHours()` turns each teaching date in the semester into a virtual one-off `AreaHours` row (id `teaching:<date>`, `homeBy − leave` hours) wherever hours are summed. Settings are already in backups, so `BACKUP_VERSION` stays 5.

v11 (no index changes): tasks get `autoNotes`, text the app writes and keeps current (the RESICO estimate). The upgrade moves the app's estimate out of tax quests' `notes`; a note the user wrote stays in `notes`, which the app never rewrites.

v10: new table `areaHours` (E-10): non-focus hours per area, one-off (`hours` on `date`) or standing (`weekly`: `hours` every week from `date` until `until`). Expenses may now carry `areaId` (an existing index): the activity they're a cost of, or `'shared'` for shared work costs. Settings gain `floorRate` (only when set by hand; otherwise the floor is computed from spending, savings % and paid hours) and `lastBackupAt`. Backups are `BACKUP_VERSION` 5.

v9 (no index changes): tasks get `recurrence` (`every` day/week/month, `anchorDay` for monthly, `series`, `keepMissed`). Completing a repeating quest creates the next instance with the id `<series>@<due date>`; the RESICO monthly declaration is the series `tax-m` and keeps its `tax-m-<yyyy-mm>` ids. The upgrade marks existing `tax-m-*` quests as that series.

v8: new table `reviews` (P1-4), one row per Mon–Sun week keyed by its Monday: `wins` (3 free-text lines), `nextQuestIds` (3 task ids), `note`. No rows to migrate. Backups are `BACKUP_VERSION` 4.

v7: new table `pipelineEvents` (conversations, proposals, case studies, stage changes); opportunities gain `kind` (`job`, `project`, `retainer`) and `nextActionDate`. Backups are `BACKUP_VERSION` 3.


v6 (no index changes): habits get `minLabel` and `plan`; a new "Eat well" ritual (`eat`). Plans live in `src/db/habitPlans.ts`.

V-6 tax fields (no Dexie version needed, new optional fields only): income transactions can carry `incomeTax` (`kind` resico/salary/none, `subtotal`, `ivaCharged`, `isrWithheld`, `ivaWithheld`, `clientIsCompany`; `amount` stays what landed in the account) and expenses `ivaCreditable`. Settings gain `taxProfile` and `splitPlan` (`savingsPct`, `skillsPct`, `funPct`) and `smartAsked`. RESICO filing quests use deterministic task ids `tax-m-<yyyy-mm>` and `tax-a-<yyyy>`; since v11 their estimate lives in `autoNotes`.

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
| `syncOutbox` | `id` (`<table>|<key>`) | — | v13, device-only: rows changed here and not yet pushed (`t`, `k`, `hlc`) |
| `syncState` | `key` | — | v13, device-only: `clock` (`{ hlc, offset }`), `device` (id), `keys` (non-extractable CryptoKeys), `vaultId`, `cursor` (last pulled seq), `session` (Supabase tokens), `replaceBefore` (after a backup import, until the next full pull) |
| `settings` | `key` | — | Key/value: `playerName`, `workTargets` (v3; replaces `workTargetHours`; `teaching` pair since v12), `teachingSchedule` (v12, absent until entered), `season` (E-9, `{ id: 'season:2026-11', start }`, absent until set in Control), `freshStartDismissed` (E-9, the latest closed banner keys), `workStart` (when deep work 1 starts, `HH:MM` from `WORK_START_CHOICES`, 08:00 when absent), `wakeTime`, `bedTime`, `activeTimer`, `createdAt` |

## Entities (abridged)

```ts
Area        { id, name, short, icon, color, kind: 'work'|'growth'|'hobby'|'personal',
              weeklyHoursTarget, monetizable, order, archived }
Task        { id, areaId, title, notes?, difficulty: 1..5, priority: 1|2|3, dueDate?, status: 'todo'|'doing'|'done',
              createdAt, completedAt?, recurrence?: { every: 'day'|'week'|'month', anchorDay?, series, keepMissed? }, autoNotes? }
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
- **IDs:** `crypto.randomUUID()` via `uid()` for things the user creates. Rows the app creates on its own on every device (seed rows, upgrade rows, the next instance of a repeating quest, tax quests, ledger rows) **must have deterministic ids**, or two synced devices would hold duplicates. Write "create it if it's missing" rows with `weakly(() => …)` (`src/db/db.ts`) so a real edit from the other device always wins over them.
- **Device-only settings** (`LOCAL_SETTINGS` in `src/sync/track.ts`): `activeTimer`, `lastBackupAt`, `showMarquee`, `lastExpenseCategory`. Every other setting syncs, including `workTargets` and `teachingSchedule`, because both decide XP and the two devices must award the same, `workStart`, so both devices show the same Ideal Day, and `season` and `freshStartDismissed`, so both devices show the same week and a banner closed on one stays closed on the other.
- **Dates:** `DateKey` = local `YYYY-MM-DD`. Timestamps = epoch ms.
- **Money:** MXN as JS numbers, 2 decimals in the UI. (Phase 5 may move to integer centavos. If so, write a migration.)
- **Credit cards:** `openingBalance` negative = debt when you start tracking. Purchases are negative amounts. Payments are transfers into the card (positive). A statement is "paid" when transfers into the card after its cut-off, dated on or before its due date, reach its pago para no generar intereses. A purchase at MSI is recorded at its full amount (accrual) and its plan bills total / months from the first cut-off on or after the purchase date.
- **Deletes stay hard deletes.** Since v13 the change tracker records each delete in `syncOutbox`; the sync engine turns it into a tombstone in the cloud. Domain rows never carry `updatedAt` or `deletedAt`.

## Ledger `refId` scheme
Since v13 each row's `id` equals its `refId` (one row per refId).

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
// db.ts — NEVER modify an existing version block. Append the next version, e.g.:
this.version(3).stores({
  tasks: 'id, areaId, status, dueDate, priority, completedAt, updatedAt, parentId' // only tables that change
}).upgrade(async tx => {
  await tx.table('tasks').toCollection().modify(t => { t.updatedAt ??= t.createdAt; });
});
```
Then update `types.ts`, `seed.ts` (if needed), `backup.ts` (`BACKUP_VERSION`), this document, and add a test.
