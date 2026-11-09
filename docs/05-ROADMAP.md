# 05 · Roadmap & Tickets

**Next agent: start with `docs/handoffs/2026-11-09-season-1.md`** (state, decisions, the next ticket), then `docs/handoffs/2026-11-08-next-phases.md` (the rules for real data, the whole path).

Every ticket is sized so a Cursor agent can do it in **one chat**. Do them in order inside a phase. Each has acceptance criteria (AC). Copy-paste prompts are in `docs/prompts/`.

Legend: 🟢 small (≤ 1 h) · 🟡 medium (1–3 h) · 🔴 large (split it further if the agent struggles)

---

## Phase 0 — Ship the MVP to your devices (Day 1) ✅ code exists
| ID | Ticket | AC |
|---|---|---|
| P0-1 🟢 | Run locally | `npm install && npm run dev` opens the app. `npm test` passes |
| P0-2 🟢 | Deploy to Vercel/Cloudflare Pages | HTTPS URL works. See `07-DEPLOY.md` |
| P0-3 🟢 | Install the PWA on the Android tablet (Chrome → ⋮ → Install app) + laptop (Chrome install icon) | App icon on both, opens standalone, works offline |
| P0-4 🟢 | Personalize | Name, card limits/cut-off/pay-by days, December opportunities renamed, `.ics` imported into calendar |

## Phase 1 — Polish & personal fit (Weeks 1–3)
| ID | Ticket | AC |
|---|---|---|
| P1-1 🟡 ✅ | **Recurring quests** (daily/weekly/monthly, e.g. "Grade weekly quizzes") | Field `recurrence` on Task. Completing a recurring quest creates the next instance. Dexie v3 migration (next free version). Tests |
| P1-2 🟡 | **Sub-tasks / checklist** inside a quest | `checklist: {id,text,done}[]` on Task. Progress chip on TaskRow |
| P1-3 🟡 ✅ | **Habit editor** in Settings (add/edit/archive/reorder habits, change XP, core flag) | Changes reflect on Today. Archived habits keep history. *Decided 2026-11-09:* core is fixed on every habit; the 4 core habits keep their XP and can't be archived; rituals pay 5/10/15/20 XP; the sleep target is fixed |
| P1-4 🟡 ✅ | **Weekly Review screen** (`/review`) | Shows last 7 days: perfect-day rate, hours per area vs target, money in/out, top 3 wins (free text), next week's top 3. Saves a `reviews` row. +50 XP once per week |
| P1-5 🟢 | **Level-up celebration** | Full-screen modal with new title when level increases. Confetti (CSS only) |
| P1-6 🟢 | **Sound + haptics** toggle | Tiny WebAudio blips on complete/level-up. `navigator.vibrate(20)` when available. Off by default on laptop |
| P1-7 🟡 | **Spanish / English UI** | `src/lib/i18n.ts` dictionary + `t()` helper. Language in settings. All page strings migrated |
| P1-8 🟢 | **Daily quests** | Each day auto-suggests 3 quests (from rules: 1 money, 1 pipeline, 1 growth). Accepting adds them |
| E-10 🟢 ✅ | **Real MXN/h** (from `09-EVALUATION.md`) | Net of taxes and each area's costs, focus + non-focus hours, 30/90/365-day window, kill/scale verdicts |
| T-1–T-5 🟡 ✅ | **Teaching days** (approved 2026-11-07, `docs/handoffs/2026-11-07-teaching-days.md`) | Schedule in Control, teaching-day Ideal Day and Now card, 4/5 h targets, the schedule's hours count for the real MXN/h, the floor and the weekly review. Dexie v12. Tests |
| P1-9 🟢 ✅ | **Code-split routes** | `React.lazy` per page. Main chunk < 300 kB |
| P1-10 🟢 | **More achievements** | Add the list in `04-GAME-DESIGN.md` → "To add" |
| S-3 🟢 ✅ | **Keep the data on the device** (2026-11-09) | At startup the app asks the browser to keep its data (`navigator.storage.persist()`, `src/lib/storage.ts`), so Chrome won't clear it when space runs low. Control → Backup shows the storage status and the last backup from this device; Today shows a reminder when this device has no backup in 7 days. Both export buttons record `lastBackupAt`. Tests |
| W-1 🟢 ✅ | **Work starts at** (asked 2026-11-09) | A synced `workStart` setting in Control (07:30 to 09:30, 15-minute steps; 08:00 by default). The Ideal Day, the teaching-day variant, the Now card and the `.ics` export follow it: exercise, breakfast and intel share the morning, the work day shifts, the evening's free time absorbs it. 8 h of deep work at every choice. Tests. No XP or schema change |
| E-9 🟡 ✅ | **Fresh starts and the Season 1 banner** (from `09-EVALUATION.md`, done 2026-11-09) | Season start date as a synced setting in Control; Season banner on Today (week N of 12 in Mon–Sun weeks, phase, done when, boss); Monday and first-of-month banners, one at a time, closed on both devices. Pure rules in `src/game/season.ts`, tests. No XP or schema change; no coin wager (Season 2) |

## Phase 2 — Cloud sync between tablet and laptop (plan approved 2026-11-07)
End-to-end encrypted sync through the user's own Supabase project: the server stores only ciphertext under opaque ids. Design in `02-ARCHITECTURE.md` ("Sync design"); handoff in `docs/handoffs/2026-11-07-sync.md`. One commit per ticket.

| ID | Ticket | AC | Status |
|---|---|---|---|
| P2-1 🔴 | **Groundwork, no network** | Dexie v13: `syncOutbox` + `syncState` (device-only); XP id = refId (upgrade keeps every point); a DBCore middleware records every real change (no-op writes skipped, pulled rows not recorded, weak "create if missing" writes); seed rows get fixed ids; pulled rows fire no toasts. Migration + tracking tests | Done |
| P2-2 🔴 | **Encryption + sync engine, fake server** | AES-GCM per row from a passphrase (PBKDF2); opaque HMAC row ids; hybrid logical clock; pull → apply in one transaction → re-check touched days → push; server-side last-write-wins; tests with two simulated devices | Done |
| P2-3 🔴 | **Supabase + sign-in + linking + status** | `supabase/migrations/` (RLS, atomic push with serialized sequence numbers; tested in PGlite); plain `fetch` client (lazy, no runtime dependency); email-code sign-in in Control; first device uploads, a second device saves a backup file and takes the cloud copy; HUD cloud glyph; triggers (open, focus, online, 60 s, 3 s after a write); `.env.example`; setup in `07-DEPLOY.md` | Done |
| P2-4 🔴 | **Import, reset and the cloud copy** | Import while synced replaces the cloud copy (said in its confirmation); reset erases this device only and signs it out; "Delete cloud copy" with a double confirmation; re-create after a forgotten passphrase | Done |

Follow-ups after sync went live (`docs/handoffs/2026-11-08-next-phases.md`):

| ID | Ticket | AC | Status |
|---|---|---|---|
| S-1 🟢 | **Show passphrase** | One Show/Hide button per sync form (both fields at once when creating); hidden by default; no auto-capitalize, autocorrect or spellcheck on passphrase fields, so a visible field isn't "fixed" by the keyboard; a note when it starts or ends with a space (never trimmed). Checked in `scripts/sync-e2e/` | Done |
| S-2 🟢 | **Sign-ups off** | The user turns off "Allow new users to sign up" in Supabase → Authentication → Sign In / Providers (no code) | Waiting on the user |

## Phase V — v2 economy and money engine (approved and built 2026-11-06)
From `09-EVALUATION.md` (decisions D-1 to D-7). All eight tickets are done, one commit each (`V-1` … `V-8`). One commit per ticket. Sizes: (S) ≤ 1 h, (M) 1–3 h, (L) split into several commits. Each follows the Definition of Done in `AGENTS.md`.

| ID | Ticket | AC |
|---|---|---|
| V-1 (S) | **Integrity fixes** | Overlapping sessions refused. Timer sessions capped at 12 h, with a "still working?" banner after 3 h. One full-value Epic per day, and an Epic needs a "done means…" note. Achievements re-lock (and revoke XP) when their condition becomes false. Bookkeeper counts a transfer once. Goal progress pays once per goal per month. Tests |
| V-2 (M) | **Economy B** | Done/full deep-work targets per weekday/weekend (settings). Focus XP 20/h pro-rata, recalculated per day, nothing after the full target. 4 core habits, Perfect Day +60, Good Day +25 (3 of 4), weekly scorecard +150. Hobby areas and intel pay no coins. Dexie v3. Tests |
| V-3 (M) | **Habit science** | Min version per habit (counts for streak and Good Day, half XP). "When…, I will…" plan. Log yesterday. Streak shields (earned per 7 Good-or-Perfect days, max 2, ledger-based). "Eat well" ritual. Tests |
| V-4 (L) | **Card statements, bank presets** | Banorte preset (due = cut-off + 20 days). Statements table with exact amounts. MSI plans. Paid-toward-statement and status. Alerts and rewards follow the *pago para no generar intereses*. Dexie v4. Tests |
| V-5 (M) | **Wealth levels** | Account roles (operating, tax, shield, invest, skills, fun). Levels 1–5 from real data, with unlocks (investing at 3 and 6 months of spending). Milestones award XP once. Tests |
| V-6 (L) | **RESICO tax module + split it** | CFDI fields on income and creditable IVA on expenses. Monthly ISR/IVA estimate, due on the 17th, quests for the monthly and annual returns, 3.5 M cap tracker. "Split it" sheet with an exact tax reserve and SMarT escalation. Tests |
| V-7 (M) | **Leading indicators** | Log conversations, proposals, case studies; stage changes; stale next actions; Rainmaker achievement. Tests |
| V-8 (S) | **UX fixes** | "Now" card on Today, tap targets ≥ 40 px, last-used category, redeem confirm and undo, savings-rate edge cases, calmer header |

## Phase 3 — AI Coach (Weeks 5–8)
All LLM calls go through a **Supabase Edge Function** (`supabase/functions/coach`), so the API key never reaches the browser. Use the official Anthropic SDK, and check the current model names in the Anthropic docs when you implement. Use a small/fast model for parsing and a stronger one for reviews.

| ID | Ticket | AC |
|---|---|---|
| P3-1 🟡 | Edge function `coach` with actions `parse`, `brief`, `review` | Auth required. Rate-limited. Key in Supabase secrets |
| P3-2 🟡 | **Quick add (natural language)** | One input on Today: "gasté 230 en tacos con crédito 2", "quest: calificar parciales mañana difícil", "trabajé 2h en Weaving". Returns a structured JSON preview → user confirms → saved |
| P3-3 🟡 | **Morning briefing** | On first open after 05:00: today's quests, cards due, streaks at risk, one sentence of strategy from `00-MASTER-PLAN.md` |
| P3-4 🟡 | **AI weekly review** | Reads 7-day aggregates (not raw notes) and gives wins, leaks, and 3 concrete reallocations of hours |
| P3-5 🔴 | **Newsletter / video digest** | Paste links or forward to a mailbox → summarize into a 5-minute brief. (Optional: Gmail API later) |

## Phase 4 — Reminders & game depth (Weeks 8–12)
| ID | Ticket | AC |
|---|---|---|
| P4-1 🔴 | **Web Push** (VAPID) via Supabase cron + edge function | Wake, wind-down (21:15), money check-in (17:30), card due (D-3, D-1). Works on the installed Android Chrome PWA (tablet) and laptop. Secondary: iPad only if installed to Home Screen, iPadOS ≥ 16.4 |
| P4-2 🟡 | **Google Calendar sync** (optional) | Create/update routine and quest due dates as events |
| P4-3 🟡 | HP/Energy + streak shields | As specified in `04-GAME-DESIGN.md` |
| P4-4 🟡 ✅ (progress) | Seasons + boss fight | *Done 2026-11-09: live boss progress on the Season banner, display only (`bossProgress()` in `src/game/season.ts`, tests).* Live boss progress from real data (first retainer, 1-month shield, 30-day Good-or-Perfect rate); the season start and plan text already exist (E-9, `src/game/season.ts`). Boss HP damaged by focus hours touches the economy: ask first |
| P4-5 🟢 | Loot drops | 10 % bonus coins on Hard/Epic completion |

## Phase 5 — Wealth pro (Month 3+)
| ID | Ticket | AC |
|---|---|---|
| P5-1 🔴 | **Banorte statement import** (CSV first, then PDF text) | Upload → parse → preview → dedupe (date+amount+description hash) → import. Category rules engine |
| P5-2 🟡 | Recurring transactions & subscriptions | Monthly rent, subscriptions auto-suggested on their date |
| P5-3 🟡 | Budgets per category | Monthly limits, bars, overspend warnings |
| P5-4 🟡 | Net-worth history | Daily snapshot table + line chart |
| P5-5 🟡 | Investments | Holdings (CETES, ETFs, AFORE/PPR) with manual value updates |
| P5-6 🟡 | Projection simulator | Inputs: monthly invest, return, years → FV chart. Shows when you hit 1 M / 10 M |
| P5-7 🟢 | Invoice tracker (CFDI) | Track issued invoices, paid/unpaid, tax reserve suggestion |
| P5-8 🟡 | Freelance CRM | Clients, projects, rates, retainers linked to Opportunities and income |
