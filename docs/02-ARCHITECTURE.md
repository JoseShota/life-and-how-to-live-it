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
| Sync (Phase 2) | **Supabase** (Postgres + Auth + Edge Functions) | Free tier, also hosts the AI proxy and push cron later |

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
  finance/
    finance.ts          # PURE money math: balances, card status, period totals, real MXN/h, pipeline
  lib/
    util.ts             # ids, dates (local YYYY-MM-DD keys), MXN formatting, cx()
    hooks.ts            # usePlayer (derived from ledger), useNow, useToday
    toast.tsx           # reward toasts (hooks into db.xp 'creating')
    routine.ts          # IDEAL_DAY template + .ics generator
    backup.ts           # JSON export/import
  components/
    ui.tsx              # Card (Win95 window), Button, Bar (chunky), Ring, Input, Select, Textarea, Modal, Chip, Empty, PageTitle
    Layout.tsx          # HUD + marquee ticker + vapor backdrop + Win95 taskbar/Start menu + archive footer
    TaskBits.tsx        # TaskRow, TaskForm (incl. repeats)
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
2. **Every award has a deterministic `refId`** (`task:<id>`, `habit:<habitId>:<date>`, `session:<id>`, `perfect:<date>`, `workday:<date>`, `tx:<id>`, `ach:<key>`). Undo = `revoke(refId)`.
3. **`evaluateDay(date)` is idempotent.** Call it after anything that affects habits or sessions.
4. **Dates are local `YYYY-MM-DD` strings** (`dateKey()`), never UTC ISO dates, so "today" means Mexico City today.
5. **Money is signed MXN numbers** on the transaction (`+` in, `−` out). Credit-card balances are negative when you owe. Transfers are two legs sharing `transferId`.
6. **Dexie schema:** never edit an existing `version(n)` block. Add `version(n+1).stores({...}).upgrade(tx => …)`.
7. `game/rules.ts` and `finance/finance.ts` stay **pure** (no DB, no React) and are unit-tested.

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

## Sync design (Phase 2, planned)
- Add `updatedAt: number` and `deletedAt?: number` to every syncable table (Dexie v3 upgrade backfills them).
- Mirror tables in Supabase Postgres with `user_id` + RLS (`user_id = auth.uid()`).
- Sync loop: push local rows with `updatedAt > lastPushedAt`; pull remote rows with `updated_at > lastPulledAt`; **last-write-wins** per row; soft-delete with tombstones.
- The `xp` ledger is append-only: union by `id` (no conflicts).
- Trigger sync on app focus, every 60 s while open, and after writes (debounced).
- Alternative if you want zero backend work: **Dexie Cloud** (paid beyond free tier). Decide in Phase 2.

## Security & privacy
- No secrets in the client bundle, ever. AI keys live in a Supabase Edge Function (Phase 3).
- Financial data stays on the device in the MVP. Remind yourself to export backups weekly.
- Supabase: RLS on every table, no `service_role` key in the client.
