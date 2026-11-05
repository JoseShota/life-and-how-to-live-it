# AGENTS.md — Instructions for AI coding agents (Cursor, Claude Code, Copilot…)

You are working on **Ascenso**, a single-user, offline-first "life RPG" PWA (React + TypeScript + Dexie + Tailwind). It gamifies work quests, a daily routine and personal finance (MXN, Banorte cards) for one person, used on a tablet and a laptop.

## Read before coding
1. `docs/01-PRD.md`: what the product is and isn't.
2. `docs/02-ARCHITECTURE.md`: structure and **invariants** (must not break).
3. `docs/03-DATA-MODEL.md`: tables, refId scheme, migration recipe.
4. `docs/04-GAME-DESIGN.md`: XP economy (change numbers only in `src/game/rules.ts`).
5. `docs/05-ROADMAP.md`: the ticket you're implementing.
6. `docs/00-MASTER-PLAN.md`: the user's life/wealth strategy. Features must serve it.

## Commands
```bash
npm install          # once
npm run dev          # dev server (http://localhost:5173, --host for tablet on LAN)
npm run typecheck    # tsc strict
npm test             # vitest
npm run build        # production build + service worker
```
**Definition of Done for every change:** `npm run typecheck && npm test && npm run build` all pass, the feature was exercised in the browser at both ~820 px (tablet) and ~1366 px (laptop) widths, and the docs are updated if behavior or schema changed.

## Hard rules
- **Never edit an existing `this.version(n)` block in `src/db/db.ts`.** Add `version(n+1)` with an `upgrade()`.
- **XP/coins only through `award()` / `revoke()` / `redeem()` / `checkAchievements()`.** Never store totals. Every award needs a deterministic `refId` so it can be undone.
- **Dates:** use `dateKey()` from `src/lib/util.ts` (local `YYYY-MM-DD`). Never `toISOString().slice(0,10)`.
- **Money:** signed MXN on transactions. Credit card debt is negative. Transfers = two legs with the same `transferId`.
- Keep `src/game/rules.ts` and `src/finance/finance.ts` **pure** and covered by tests in `tests/`.
- Types live in `src/db/types.ts`. Reuse UI primitives from `src/components/ui.tsx` before creating new ones.
- Tailwind only, using the design tokens in `tailwind.config.js` (`bg`, `panel`, `panel2`, `line`, `xp`, `gold`, `hp`, `ok`). Tap targets ≥ 40 px.
- **No secrets in the frontend.** Anything needing an API key goes through a server/edge function.
- No new dependencies without a one-line justification in the PR/commit message. Pin exact versions.
- Don't delete user data paths (export/import/reset) or weaken confirmations on destructive actions.
- Small, focused diffs. One ticket per branch/commit.

## Style
- Functional React components, hooks, `useLiveQuery` for reads.
- File per page in `src/pages`. Shared bits in `src/components`.
- Name things in English in code. User-facing strings in English for now (i18n arrives in P1-7).
- Prefer clarity over cleverness. Comments explain *why*.

## When unsure
Ask before changing: the XP economy, the schema, the sync design, or anything in `00-MASTER-PLAN.md`. Propose a plan first for any 🔴 ticket.
