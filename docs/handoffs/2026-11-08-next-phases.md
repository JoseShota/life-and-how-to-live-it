# Handoff: the path after sync (Phases 1 to 5)

*Written 2026-11-08 by the agent that built P2 Sync (PR #4, merged as `e0325af`; deploy doc PR #5). For the next coding agent, who owns the roadmap from here until every phase is done.*

## The prompt (paste this to start each new session)

> You are the coding agent for **Life and How to Live It** (repo `JoseShota/life-and-how-to-live-it`), a private, offline-first "life RPG" PWA (React + TypeScript + Dexie + Tailwind). It is live at https://life-and-how-to-live-it.vercel.app; Vercel deploys `main`. The user uses it **every day, with real data**, on a Lenovo Android tablet (installed via Chrome) and a laptop (Chrome). Both devices sync through the user's own Supabase project, end-to-end encrypted.
>
> Your job is to take the roadmap to the end, one ticket at a time, without ever risking the user's data.
>
> Read, in this order:
> 1. `AGENTS.md`. Its hard rules override everything else.
> 2. `docs/handoffs/2026-11-08-next-phases.md` (this file): the rules for real data and sync, the remaining path, and the decisions to ask for.
> 3. `docs/02-ARCHITECTURE.md` (invariants, "Sync design"), `docs/03-DATA-MODEL.md`, `docs/05-ROADMAP.md`, `docs/09-EVALUATION.md` (section 0 and the status tables), `docs/00-MASTER-PLAN.md`, `docs/04-GAME-DESIGN.md`, `docs/08-DESIGN-SYSTEM.md`.
>
> The code is the source of truth: the older prompts in `docs/prompts/` predate several changes, so verify every claim against the code.
>
> How the user wants to work:
> - **First, a short plan in plain words**: what you would build, in which commits, what you'd do differently from the docs and why, and the decisions you need from them. Then wait for their OK. 🔴 tickets and anything touching the XP economy, the schema, sync or `00-MASTER-PLAN.md` always need an approved plan.
> - **Every number comes from the user's real data.** No hard-coded personal figures. Personal figures (schedule, money) never go into the repo.
> - **Schema changes:** a new Dexie version with an `upgrade()`, and `tests/migration.test.ts` extended so existing data survives the upgrade.
> - **Definition of done for each commit:**
>   - `npm run typecheck && npm test && npm run build` pass, within the bundle budget.
>   - Playwright at 820 px (touch) and 1366 px, no console errors.
>   - Tap targets of at least 40 px.
>   - The docs updated.
> - No emoji, no secrets in the repo, no new dependency without a one-line reason and an exact version.
> - Don't change XP numbers in `src/game/rules.ts`, or anything in `00-MASTER-PLAN.md`, without asking. Never weaken export, import, reset or sync confirmations.
> - **Push to your branch, then ask before opening and before merging the PR.**
> - End each step with a short summary and the decisions they need to make.
>
> Start by proposing which ticket to do first, using the recommended order in this handoff.

## State of the app (2026-11-08)
- **Dexie v13.** `BACKUP_VERSION` 5. 187 tests. Startup JS 337.6 kB of the 350 kB budget (entry < 300 kB). The sync engine is a separate lazy chunk of about 11 kB.
- **Sync is live** (P2-1 to P2-4 are done):
  - Supabase project `life-sync`, Americas region.
  - The SQL is `supabase/migrations/0001_sync.sql`.
  - Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which are build-time values (see `docs/07-DEPLOY.md`).
  - Both devices are linked.
  - Sign-in is the link in Supabase's default email: no SMTP, so the email templates can't be edited.
- The user has started using the app for real. Treat every device as holding data that can't be lost.

## Rules for real data and sync (new; follow them in every ticket)
1. **Never use the real Supabase project or the user's data in tests.**
   - Unit tests: fake-indexeddb.
   - Sync tests: the two simulated devices in `tests/helpers/devices.ts` against `tests/helpers/fakeServer.ts`.
   - SQL tests: `tests/supabase.test.ts`, which runs the migrations in PGlite.
   - The UI: `scripts/sync-e2e/` (README there), a local stand-in for Supabase and two Chromium devices.
2. **Every write is synced automatically** by `src/sync/track.ts`, so a new feature must be sync-safe:
   - **Rows the app creates by itself** (seeds, upgrades, generated quests, ledger rows, daily suggestions, snapshots) need **deterministic ids**, or two devices make duplicates.
   - **"Create it if it's missing"** writes go through `weakly()` (in `src/db/db.ts`), so they never overwrite a real edit made on the other device.
   - **Derived values** must be recomputable from synced inputs, and re-running them must write nothing when nothing changed. A write that changes nothing isn't recorded, so `put` of an identical row is fine.
   - **XP and coins:** only through `award()`, `revoke()`, `redeem()` and `checkAchievements()`, with a deterministic `refId`. The row id is the refId.
   - **A new table** goes in `ALL_TABLES`, which means it syncs and is in backups. Bump `BACKUP_VERSION`, and make import tolerate older backups.
   - **A device-only setting** (like the running timer) goes in `LOCAL_SETTINGS`.
   - **A new setting that changes XP** must sync. Otherwise the two devices award different XP.
3. **Schema changes reach the devices one at a time.** When a newer app pushes rows, a device still on the older version pauses sync with "update the app" until it reloads.
   - Say this in the summary of every schema change: after the merge, reload both devices.
   - **Before merging any schema change,** ask the user to export a backup on one device (Control → Export backup).
4. **Server changes** go in a new file, `supabase/migrations/0002_*.sql`, and so on. Never edit `0001`.
   - Make them safe to re-run.
   - Keep row-level security on, and give no direct table writes to the client.
   - Return expected states as `{ "error": "<code>" }` with HTTP 200, so the browser logs no failed requests.
   - The user runs each file in Supabase's SQL Editor; give them the exact steps.
   - The server must never see plaintext data. Anything that needs the server to understand data (AI, push reminders) needs a privacy decision from the user first; see below.
5. **Secrets:**
   - The Supabase `service_role` key and any AI or push keys live only in Supabase secrets.
   - The frontend only ever has the URL and the publishable/anon key.
6. **Git:**
   - Each session gets its own branch; one ticket per branch and per commit.
   - Force pushes are blocked. Once a branch's PR is merged, start a new branch from `main`; don't reuse the old one.

## The remaining path
Status markers in `05-ROADMAP.md` are authoritative; this is the summary.

### 0. Small follow-ups from sync (do first; small)
- **S-1 Show passphrase.** Add a Show/Hide toggle on the passphrase fields in `src/components/SyncCard.tsx`. Linking on the tablet failed once because 19 hidden characters were typed by hand. Keep the inputs `type="password"` by default.
- **S-2 Sign-ups off.** Remind the user to turn off "Allow new users to sign up" in Supabase → Authentication → Sign In / Providers now that both devices are linked. They do this themselves; no code.

### Phase 1: polish and personal fit (one commit each)
- **P1-3 Habit editor** (🟡): add, edit, archive and reorder habits, with the core flag and XP.
  - Changing XP or the core flag changes the economy, so confirm with the user which fields are editable.
  - New habits need ids that can't collide across devices (`uid()` is fine for user-created habits).
  - `habits.key` is unique, and sync already resolves a key clash: it keeps the cloud row.
- **E-9 Fresh starts** (🟡):
  - a Monday and first-of-month banner that links the weekly review and the month's plan;
  - a **Season 1 banner**, because Season 1 (Nov 2026 to Feb 2027, `00-MASTER-PLAN.md` §6) is running now.
- **P1-5 Level-up celebration** and **P1-6 sound and haptics** (🟢): CSS-only confetti, respect `prefers-reduced-motion`, WebAudio blips with no audio files. Store "last seen level" as a **device-only** setting, or both devices will celebrate twice.
- **P1-8 Daily quests** (🟢/🟡): 3 suggestions a day (money, routine at risk, growth) from real data.
  - Suggestions must have deterministic ids per day (`daily:<date>:<slot>`), or each device suggests its own.
  - Accepting a suggestion creates a quest.
- **P1-2 Checklist inside a quest** (🟡): `checklist` on Task, with a Dexie version and an upgrade. Edits to the same quest on both devices follow last-write-wins per row; say so.
- **P1-10 More achievements** (🟢): from `04-GAME-DESIGN.md`. They re-lock when their condition becomes false.
- **P1-7 Spanish / English UI** (🟡): ask the user whether they want it. The UI is in English today, and the user writes in English.

### Phase 3: AI coach (🔴; needs a privacy decision first)
Sync is end-to-end encrypted, so the server can't read anything. The coach therefore can't read the database. The user must approve what the device sends.

The design that fits:
- The device computes **aggregates** (hours per area, Good-Day rate, money totals by category, quests due) and sends them only when the user taps a button.
- They go to a Supabase Edge Function `coach`, which holds the Anthropic API key as a Supabase secret, checks the user's session and enforces a daily rate limit.
- Raw notes and transaction descriptions are never sent unless the user opts in each time.

Tickets: P3-1 edge function; P3-2 natural-language quick add (send only the typed sentence plus area and account names); P3-3 morning brief; P3-4 AI weekly review; P3-5 digest (optional).
- Use the official Anthropic SDK and check current model ids in Anthropic's docs. As of this writing the Claude 5 family is current: a small, fast model such as Haiku for parsing, and a stronger one (Sonnet or Opus) for briefs and reviews.
- **Ask the user** to create an Anthropic API key and set it with `supabase secrets set`. Never paste it in chat, and never put it in the repo.
- **Decision to ask:** exactly which data each action may send.

### Phase 4: reminders and game depth
- **P4-1 Web Push** (🔴). The same privacy issue as the coach applies: card-due reminders need dates the server can't read.
  - Proposed design: the device computes the next reminder times and uploads only `{ time, generic text }`. For example "A card payment is due soon", never amounts or card names. Routine reminders (wake, wind-down, money check-in) come from the schedule.
  - Supabase cron and an edge function send them, with VAPID keys in Supabase secrets.
  - Needs `vite-plugin-pwa` injectManifest with a custom service worker. Keep the precache and offline behaviour, and test the update path.
  - **Ask the user** to approve the design and what text is uploaded.
- **P4-3 HP / Energy:** streak shields are already done (V-3); only HP and recovery mode remain. This is an XP-economy change, so it needs a plan.
- **P4-4 Seasons and boss fight:**
  - Season 1 is already defined in `00-MASTER-PLAN.md` §6; its boss is "first retainer + 1-month fund + 30-day Good-or-Perfect ≥ 60 %".
  - The season row needs a deterministic id (`season:2026-11`).
  - Show progress from real data.
- **P4-5 Loot drops:** a random bonus must be decided once and synced. Use a deterministic seed from the refId so both devices agree.
- **P4-2 Google Calendar** (optional): ask first.

### Phase 5: wealth pro
- **P5-1 Banorte statement import** (🔴): ask the user for a sample CSV with personal data removed before guessing the format. Imported transactions need ids derived from a hash of date, amount and description, so importing on both devices doesn't duplicate.
- **P5-2** recurring transactions.
- **P5-3** budgets.
- **P5-4** net-worth history: one snapshot per day with id `nw:<date>`, written weakly.
- **P5-5** investments.
- **P5-6** projection simulator: a pure function, tested.
- **P5-7** invoices (CFDI).
- **P5-8** freelance CRM.
- Money stays signed MXN; keep `finance.ts` pure and tested.

### Open from the evaluation
- **E-8 / Option C**, coins backed by the fun budget: a Season 2 experiment that needs the user's OK.

## Recommended order (propose it; the user decides)
1. **S-1 Show passphrase** (tiny), with the S-2 reminder.
2. **P1-3 Habit editor:** daily use benefits most.
3. **E-9 Fresh starts and the Season 1 banner:** the season is running now.
4. **P1-5 + P1-6:** celebration, sound and haptics.
5. **P1-8 Daily quests.**
6. **P1-2 Checklist,** then **P1-10 Achievements.**
7. **P4-4 Seasons and boss**, while Season 1 is still running.
8. **Phase 3 AI coach**, after the privacy decision and the API key.
9. **P4-1 Web Push**, after the privacy decision.
10. **P4-3 HP, P4-5 loot.**
11. **Phase 5,** starting with P5-1 once the user provides a sample CSV.
12. **P1-7 Spanish,** if wanted.

## Decisions to ask the user, when the ticket comes up
| When | Question |
|---|---|
| P1-3 | Which habit fields may they edit (XP and core change the economy)? |
| P1-7 | Do they want a Spanish UI at all? |
| P3 | Which data each AI action may send; the Anthropic key setup |
| P4-1 | The push design and the exact text the server may hold |
| P4-3 | The HP rules (economy) |
| P5-1 | A sample Banorte CSV with personal data removed |
| E-8 | Whether to try coins backed by the fun budget in Season 2 |
