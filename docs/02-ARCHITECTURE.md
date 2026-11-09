# 02 · Architecture

## Stack (pinned in `package.json`)
| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 5** + **TypeScript 5 (strict)** | Fast, simple, static output |
| UI | **React 18** + **React Router 6** | Standard, Cursor knows it well |
| Styling | **Tailwind CSS 3** + retro CSS in `src/index.css` | Design tokens in `tailwind.config.js`; aesthetic rules in `08-DESIGN-SYSTEM.md` |
| Icons | Hand-drawn `<Glyph name="…" />` (`src/components/Glyph.tsx`) | No icon library, no emoji (see `08-DESIGN-SYSTEM.md`) |
| Charts | **Recharts** | |
| Storage | **Dexie 4** (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) | Offline-first, reactive queries, schema versioning |
| PWA | **vite-plugin-pwa** (Workbox, `autoUpdate`) | Installable via Chrome on the Android tablet (Lenovo) and the laptop |
| Tests | **Vitest** + **fake-indexeddb** | Unit tests for rules, finance math and engine |
| Hosting (recommended) | **Vercel** or **Cloudflare Pages** (static) | Free, HTTPS (required for PWA install) |
| Sync (Phase 2) | **Supabase** (Postgres + Auth), plain `fetch`, WebCrypto | Free tier, end-to-end encrypted, no client library; also hosts the AI proxy and push cron later |

## Folder layout
```
src/
  main.tsx              # bootstrap: seed DB → render router
  index.css             # Tailwind + small keyframes
  db/
    types.ts            # ALL domain types (single source of truth)
    db.ts               # Dexie schema + versions, settings helpers
    seed.ts             # first-run data: areas, habits, accounts, rewards, goals, opps, onboarding quests
  game/
    rules.ts            # PURE balance functions (XP tables, level curve, multipliers) — no I/O
    engine.ts           # side-effectful actions: completeTask, setHabit, logSession, evaluateDay, redeem…
    achievements.ts     # achievement defs + checker + listener
    review.ts           # PURE weekly-review aggregates (day grades, hours per area, leading indicators)
    habitEdit.ts        # PURE habit-editor rules (P1-3): what may change on a habit, new rituals, reordering
    habitStore.ts       # the habit editor's writes (add, save, move, archive, delete); enforces habitEdit.ts again
  finance/
    finance.ts          # PURE money math: balances, card status, period totals, real MXN/h, pipeline
  lib/
    util.ts             # ids, dates (local YYYY-MM-DD keys), MXN formatting, cx()
    hooks.ts            # usePlayer (derived from ledger), useNow, useToday
    toast.tsx           # reward toasts (hooks into db.xp 'creating')
    routine.ts          # IDEAL_DAY template + .ics generator
    backup.ts           # JSON export/import
  sync/
    track.ts            # startup: DBCore middleware recording changes in syncOutbox, the clock, device-only settings
    crypto.ts           # passphrase → keys (PBKDF2), AES-GCM rows, HMAC row ids
    server.ts           # the SyncServer interface and SyncError codes
    engine.ts           # lazy: pull → apply → re-check days → push; first device / join / unlink
    supabase.ts         # lazy: fetch client (email-code auth, the five sync_* SQL functions), session in syncState
    runtime.ts          # lazy: one engine per tab + triggers (open, focus, online, 60 s, 3 s after a change)
    status.ts           # startup: the status store for the HUD glyph; boots the runtime on linked devices
supabase/migrations/    # 0001_sync.sql: sync_vaults, sync_records, RLS, sync_* functions (run in PGlite by tests)
  components/
    ui.tsx              # Card (Win95 window), Button, Bar (chunky), Ring, Input, Select, Textarea, Modal, Chip, Empty, PageTitle
    Layout.tsx          # HUD + marquee ticker + vapor backdrop + Win95 taskbar/Start menu + archive footer
    TaskBits.tsx        # TaskRow, TaskForm (incl. repeats)
    SyncCard.tsx        # Control → Sync: email code, passphrase, create / link, status
    HabitBits.tsx       # Control → Habits (order, add, archive) and the habit editor sheet (also opened from Today)
    RealRate.tsx        # Wealth Engine card (real MXN/h), useRealRates(), non-focus hours form
    ActiveTimerPill.tsx
  pages/index.ts        # React.lazy loaders for every page + idle preload (P1-9)
  pages/                # one file per route: Today, Quests, Focus, Money, Rewards, Stats, Settings, Review (menu only)
tests/                  # vitest
docs/                   # this documentation
.cursor/rules/          # rules Cursor loads automatically
AGENTS.md               # entry point for any coding agent
```

## Data flow
```
 UI (pages/components)
   │  reads  → useLiveQuery(() => db.table…)          (reactive, re-renders on change)
   │  writes → game/engine.ts actions  (or db.table.put for plain CRUD)
   ▼
 engine.ts ── award()/revoke() ──► db.xp (append-only ledger)
   │                                   │
   └── evaluateDay(), checkAchievements()   └─► usePlayer() derives level/XP/coins
```

### Key invariants (do not break)
1. **XP/coins only change via `award()` / `revoke()` / `redeem()`** in `game/engine.ts` (achievements write via `checkAchievements`). Never store XP totals anywhere.
2. **Every award has a deterministic `refId`** (`task:<id>`, `habit:<habitId>:<date>`, `session:<id>`, `perfect:<date>`, `workday:<date>`, `tx:<id>`, `ach:<key>`), and since v13 the row's `id` **is** its refId (one row per refId, written with `put`). Undo = `revoke(refId)`.
3. **`evaluateDay(date)` is idempotent.** Call it after anything that affects habits or sessions.
4. **Dates are local `YYYY-MM-DD` strings** (`dateKey()`), never UTC ISO dates, so "today" means Mexico City today.
5. **Money is signed MXN numbers** on the transaction (`+` in, `−` out). Credit-card balances are negative when you owe. Transfers are two legs sharing `transferId`.
6. **Dexie schema:** never edit an existing `version(n)` block. Add `version(n+1).stores({...}).upgrade(tx => …)`.
7. `game/rules.ts` and `finance/finance.ts` stay **pure** (no DB, no React) and are unit-tested.
8. **Sync-safe writes (v13).** Every write is tracked automatically (`src/sync/track.ts`); never write to `syncOutbox`/`syncState` by hand. A write that changes nothing is not recorded, so derived code may re-run freely. Rows the app creates by itself get deterministic ids, and "create it if it's missing" writes go through `weakly()`.

## Bundle (P1-9)
- Every page is a `React.lazy` chunk (`src/pages/index.ts`), shown under a `Suspense` fallback in `Layout`. After the first render the other pages preload when the browser is idle, and the service worker precaches every chunk, so tabs switch instantly and the app works offline.
- React, the router and Dexie live in a `vendor` chunk (`manualChunks` in `vite.config.ts`): an app update doesn't re-download them.
- `npm run build` runs `scripts/check-bundle.mjs`: it fails if the entry chunk is ≥ 300 kB or the startup JS (entry + preloaded vendor) is ≥ 350 kB.
- Startup code avoids heavy libraries: `dateKey()` is hand-rolled instead of date-fns; Recharts only loads with Treasury and Archive.
- Before P1-9: one 854 kB chunk (255 kB gzip). After: entry 74 kB + vendor 256 kB + Today 17 kB (about 120 kB gzip).

## Responsive strategy
- All sizes: sticky HUD on top, Win95 taskbar (Start + 7 tabs + clock) at the bottom.
- `< lg`: single-column windows. `≥ lg`: 2-column window grids.
- Modals become bottom sheets on small screens.

## Sync design (Phase 2, approved 2026-11-07)
Tablet and laptop sync through the user's own Supabase project. **End-to-end encrypted**: the server stores only ciphertext under opaque ids. Code in `src/sync/`; tests with two simulated devices in `tests/sync.test.ts`.

**What syncs.** Every table in `ALL_TABLES`, row by row, except the device-only settings (`LOCAL_SETTINGS`: `activeTimer`, `lastBackupAt`, `showMarquee`, `lastExpenseCategory`). Settings that decide XP (`workTargets`, `teachingSchedule`) must sync, or the devices would award different XP for the same day.

**Change tracking** (`track.ts`, in the startup bundle, about 3 kB). A Dexie DBCore middleware sees every write and records `{table, key, hlc, n}` in `syncOutbox` in the same transaction. No call site changed, and rows keep their shape (no `updatedAt`/`deletedAt`). A write that changes nothing is not recorded, so derived code (`evaluateDay`) can re-run without echoing between devices. Transactions are tagged `remote` (rows from a pull: not recorded, no toasts) or `weak` (create-if-missing: recorded with hlc 0, so any real edit wins). Upgrade transactions are never recorded; each device runs its own.

**Clock.** A hybrid logical clock: `max(last + 1, (Date.now() + serverOffset) × 1000)`. It never goes backwards, jumps past every change already pulled, and is corrected by the server's time on each sync, so a device whose clock is off can't keep winning. Ties break by device id.

**Encryption** (`crypto.ts`, WebCrypto, no dependency). Passphrase → PBKDF2-SHA256 (600,000 iterations, random salt) → an AES-GCM-256 key and an HMAC-SHA256 key, both non-extractable and kept in `syncState`. Each row is sent as `{ rid: HMAC(table|key), hlc, dev, v: schema version, data: AES-GCM({t, k, v}) }`, with `rid` as associated data so a ciphertext can't be moved to another row. Deletes are encrypted too (`v: null`), so the server can't tell a delete from an edit. The server holds a vault (`salt`, `iterations`, a `check` ciphertext that proves a passphrase, and an `id`).

**One sync** (`engine.ts`, lazy-loaded):
1. Pull every record with `seq > cursor` (pages of 1,000). If any was written by a newer schema, stop with "update the app" (nothing applied, cursor kept).
2. Apply them in **one transaction**: a row with a newer pending local change keeps the local version (it's pushed next); otherwise the cloud version is written (or deleted) and its outbox entry dropped. The cursor moves in the same transaction.
3. Re-check the days whose sessions or habit logs arrived (`evaluateDay`, oldest first, quietly). Both devices then hold the same inputs, so derived XP converges; nothing is written when nothing changes.
4. Push the outbox: each row's current value (missing = deleted), encrypted, in **one atomic request** (only a first upload or an import is split into chunks of 1,000). An entry is cleared only if its `n` didn't change meanwhile. A lost reply is harmless: re-sending the same `(hlc, dev)` changes nothing on the server.

**Server rules** (the SQL functions; `tests/helpers/fakeServer.ts` follows the same rules). Last-write-wins per row by `(hlc, dev)`. Each accepted record gets the next per-user sequence number, assigned while holding the user's row lock, so sequence numbers commit in order and a reader can never skip a row that committed late. A push from an older schema than one already seen is refused ("update the app"); a push or pull with a stale vault id is refused ("enter the passphrase again").

**The ledger.** XP rows have `id = refId` (v13), so the same award on two devices is one row, and `revoke()` is a delete that syncs. Daily caps (one full Epic, logged transactions, conversations, savings deposits) are checked against each device's ledger, so on a day both devices are used offline a cap can pay up to twice.

**Linking.** The first device creates the vault and uploads everything. Another device enters the passphrase (a wrong one changes nothing), saves a backup file, and **replaces** its data with the cloud copy in one transaction (device-only settings stay). Seed rows have fixed ids, so two fresh devices hold identical seeds anyway. Re-keying (deleting the cloud copy and creating it again) locks the other device until it joins again.

**Client** (`supabase.ts`, no `@supabase/supabase-js`). Plain `fetch` to GoTrue (`/otp`, `/verify`, `/token`, `/logout`) and PostgREST (`/rest/v1/rpc/sync_*`). Sign-in is by email: the default Supabase email carries a link that returns to `/settings` with the session in the URL fragment, which the app takes out of the address bar before the first render (and on `hashchange`, when the link lands in a window already open); a typed code works too when the template includes `{{ .Token }}` (needs custom SMTP). The session lives in `syncState`, so "Reset app" also signs the device out. An expired token is refreshed once; a rejected refresh means signing in again; network failures and rate limits are "offline" (retried later). Everything sync-related except `track.ts` and `status.ts` is one lazy chunk (about 11 kB) that unlinked devices never load.

**Triggers** (`runtime.ts`): app open, coming back into view, `online`, every 60 s while visible, and 3 s after the outbox changes. Web Locks keep two tabs from syncing at once. The HUD shows a cloud glyph only on a linked device.

**Import, reset and the cloud copy.**
- *Import while syncing* = the backup becomes the truth everywhere. Every row it replaced is already a pending change (strong clock), and `importAll` writes `replaceBefore` (the clock at the import): on the next pull, cloud rows at or before it that the import doesn't hold are deleted in the cloud too, even ones this device never pulled. Rows the other device makes later survive. Its confirmation says so.
- *Reset app* deletes the local database (keys and session included): this device is erased and signed out; the cloud copy and the other device are untouched. A fresh start then links again (backup file, then the cloud copy).
- *Delete cloud copy* (two confirmations) deletes the vault and every record; both devices keep their data. The other device sees "locked" and offers to link again. This is also the way back from a forgotten passphrase: delete, then create the cloud copy again from the device with the data.
- Expected server states (signed out, locked, update needed, vault exists) come back as `{ error }` with HTTP 200, so the browser logs no failed requests.

**Known limits.** Last-write-wins is per row: editing the same quest on both devices before they sync keeps the later edit of the whole quest. The server sees when rows change (`hlc`) and how big they are, not what they are. A forgotten passphrase makes the cloud copy unreadable; the devices and backup files still have everything, and the cloud copy can be deleted and created again.

## Security & privacy
- No secrets in the client bundle, ever. AI keys live in a Supabase Edge Function (Phase 3).
- Financial data leaves the device only end-to-end encrypted (Phase 2 sync): Supabase stores ciphertext under opaque ids; the passphrase and keys never leave the devices. Keep exporting backups weekly.
- Supabase: RLS on every table, no `service_role` key in the client. The anon key in the bundle is public by design.
