# Handoff: deploy + quick fixes (items 2–7)

*Written 2026-11-06 by the agent that finished item 1. For the next coding agent.*

## Status checklist
- [x] 1. PWA readiness (`7414bb4`)
- [x] 2. Deploy to Vercel: https://life-and-how-to-live-it.vercel.app, production branch `main`. Checked 2026-11-06 at 820 px and 1366 px: `/money` deep-links, `/sw.js` and `/manifest.webmanifest` return 200, no installability errors, works offline after one load, zero external requests. Device installs are the user's step (P0-3).
- [x] 3. Rewards delete on tablet (`9353155`)
- [x] 4. `vite.config.ts` typing (`a618dfb`)
- [x] 5. Area icons editable in Control Panel (`c2628ad`)
- [x] 6. Edit transactions + orphaned-XP fix (`aa927c0`). Decisions: editing never changes XP; no kind change while editing; transfers edit both legs in one Dexie transaction.
- [x] 7. Docs sweep (`b7e8189`)

## Start here
1. Read `AGENTS.md`, then `docs/02-ARCHITECTURE.md`, `03-DATA-MODEL.md`, `08-DESIGN-SYSTEM.md`. The hard rules there override anything below.
2. Work on the branch you were given. **One commit per item** (message like `QF: rewards delete on tablet`).
3. Before each commit, run `npm run typecheck && npm test && npm run build`, and check the change in a browser at **820 px** and **1366 px**. Then show the user the output and the exact clicks to verify.
4. **Plan first, then code.** Wait for the user's OK on anything touching the schema, the XP economy, sync or the design system. Item 6 has one such decision (see below).

## Context you won't find in the code
- The user's tablet is a **Lenovo Android tablet**, not an iPad. The app is installed through **Chrome → Install app** (a WebAPK), not the Play Store. Treat Android Chrome as the main mobile target. iPad wording in old docs is out of date.
- The other device is a laptop (Chrome). Each device keeps its own local data until Phase 2 sync.
- Baseline after item 1: typecheck passes, **24 tests** pass, the build succeeds with the known "chunk > 500 kB" warning (ticket P1-9, not in scope here).

## Done: item 1, PWA readiness (commit `7414bb4`)
- Fonts self-hosted in `public/fonts/`, licences in `public/fonts/LICENSES.md`. ChicagoFLF is public domain per its author.
- The service worker precaches `js, css, html, svg, png, webp, woff2`, so the marble head and fonts work offline. Checked in headless Chromium: offline at both widths, with zero external requests.
- New Thermae icon `public/icon.svg` plus `pwa-192.png`, `pwa-512.png` (also the maskable icon) and `apple-touch-icon.png`. Chrome reports **no installability errors**.
- The manifest colours are `#e4ebe7` (they were the old purple `#130824`).
- `tests/fonts.test.ts` fails the build if:
  - a font file is missing,
  - a font CDN link comes back, or
  - a kanji appears in `src/` that the DotGothic16 subset doesn't cover. Regeneration steps are in `LICENSES.md`.

## Remaining items, in order

### 2. Deploy to Vercel (guide the user; you can't log in for them)
- `vercel.json` already has the SPA rewrite. Nothing to code unless a check below fails.
- Steps for the user:
  1. vercel.com → **Add New → Project** → import `JoseShota/life-and-how-to-live-it`.
  2. Framework **Vite**, build `npm run build`, output `dist`. Deploy.
  3. Production branch: `main`. These quick-fix commits are on a feature branch, so they need merging to `main` first, or the user can deploy that branch as a Preview to test.
- Once there's a URL, check:
  - a deep link like `/money` loads (rewrite works),
  - `/sw.js` and `/manifest.webmanifest` return 200,
  - the app works offline after one load.
- Then the user installs it:
  - **Lenovo:** Chrome → ⋮ → **Install app**.
  - **Laptop:** the install icon in the address bar.
- Tick **P0-2** in `docs/05-ROADMAP.md` and the handoff checklist.

### 3. Rewards can't be deleted on a tablet (small)
- `src/pages/Rewards.tsx:30`: the trash button is `hidden … group-hover:block`, so a touch screen never shows it.
- Make it always visible: low opacity at rest, `text-hp` on hover or focus. Make it a **≥ 40 px** tap target, keep `aria-label`, and add `confirm('Remove this reward?')`.
- Keep it a soft delete (`archived: true`) so existing ledger rows still make sense.

### 4. `vite.config.ts` typing (tiny)
- Import `defineConfig` from `vitest/config` instead of `vite`, and drop the trailing `as any`.
- Make sure the PWA config added in item 1 (`workbox.globPatterns`, icons, colours) is untouched.

### 5. Area icons editable in Control Panel (small)
- `src/pages/Settings.tsx` around line 30: each area row shows `<Glyph name={a.icon} />` with no way to change it.
- Make the glyph a ≥ 40 px button that opens the existing `IconPicker` (`src/components/IconPicker.tsx`) in the existing `Modal` from `ui.tsx`. On pick, call `db.areas.update(a.id, { icon })`.
- No schema change: `icon` is already a glyph name.

### 6. Edit transactions (medium, needs one decision from the user first)
- Today the list in `src/pages/Money.tsx` (~line 115) can only delete. The add form is `TxForm` in the same file (~line 170).
- Turn `TxForm` into add/edit by passing an optional existing transaction.
- **Rules:**
  - Amounts stay signed MXN: expense negative, income positive, credit-card debt negative.
  - A transfer or card payment is **two legs sharing `transferId`**. Editing either leg must update both: the amount (−n / +n), date, description, and from/to accounts. Do it inside `db.transaction('rw', db.transactions, …)`.
  - Changing the *kind* (e.g. expense → transfer) is simplest done as delete + re-create inside one Dexie transaction. Ask the user whether kind changes are even needed.
- **XP decision (ask the user before coding).** Logging a transaction awards XP with refId `tx:<firstLegId>`. A card payment that clears the card gets `FINANCE_XP.payCardInFull` instead.
  - Recommended default: **editing never changes XP**. The award was for the act of logging, so keep the original `refId` and don't re-award or revoke.
  - Exception to confirm: if an edit turns a card payment into one that does or doesn't clear the card, re-evaluate the award with `revoke` + `award` on the same refId.
- **Existing bug to fix in the same commit.** The delete handler calls `revoke(\`tx:${t.id}\`)` with the id of whichever row you tapped. For a transfer, the XP is on the **first** leg's id, so deleting from the second leg's row leaves orphaned XP.
  - Fix: look up both legs by `transferId`, then revoke for each leg's id. `revoke` on a refId with no award does nothing, so this is safe.
  - Add a fake-indexeddb test for it.
- Also make the row's delete button (`p-1`) a ≥ 40 px tap target while you're there.
- Put any new pure helper (e.g. "build the two legs") in `src/finance/finance.ts` with a unit test in `tests/`.

### 7. Docs sweep (small)
- Rename "Reward shop" to **Agora** and "Stats" to **Archive** in user-facing wording in `docs/` (01, 03, 04, 00, 02, `prompts/P1-polish.md`). Leave code identifiers and routes (`/stats`, `Stats.tsx`) alone.
- Remove **lucide-react** from `docs/02-ARCHITECTURE.md` (stack table) and `docs/prompts/P1-polish.md` ("lucide CalendarCheck icon"). Icons are `<Glyph>` only.
- The schema is at **v2**. Fix references that say the next migration is v2:
  - `05-ROADMAP.md` P1-1 and P2-2 should say v3 (or "next version"),
  - the example in the `03-DATA-MODEL.md` migration recipe should use `version(3)`,
  - "Dexie v2 upgrade backfills" in the 02 sync design should say v3.
- iPad wording: `05-ROADMAP.md` P0-3 and P4-1 should name Android Chrome as the main tablet. P4-1's "iPadOS ≥ 16.4" caveat can stay as a secondary note.
- **"Enable notifications"** (`src/pages/Settings.tsx:44`) only asks for permission. Relabel or add a one-line hint saying real reminders arrive in Phase 4 and that the `.ics` export is the way for now. Don't build scheduling.

## Out of scope for this batch
P1-9 code splitting (the bundle warning), anything in Phase 1+ tickets, and any schema change.
