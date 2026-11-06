# 05 · Roadmap & Tickets

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
| P1-1 🟡 | **Recurring quests** (daily/weekly/monthly, e.g. "Grade weekly quizzes") | Field `recurrence` on Task. Completing a recurring quest creates the next instance. Dexie v3 migration (next free version). Tests |
| P1-2 🟡 | **Sub-tasks / checklist** inside a quest | `checklist: {id,text,done}[]` on Task. Progress chip on TaskRow |
| P1-3 🟡 | **Habit editor** in Settings (add/edit/archive/reorder habits, change XP, core flag) | Changes reflect on Today. Archived habits keep history |
| P1-4 🟡 | **Weekly Review screen** (`/review`) | Shows last 7 days: perfect-day rate, hours per area vs target, money in/out, top 3 wins (free text), next week's top 3. Saves a `reviews` row. +50 XP once per week |
| P1-5 🟢 | **Level-up celebration** | Full-screen modal with new title when level increases. Confetti (CSS only) |
| P1-6 🟢 | **Sound + haptics** toggle | Tiny WebAudio blips on complete/level-up. `navigator.vibrate(20)` when available. Off by default on laptop |
| P1-7 🟡 | **Spanish / English UI** | `src/lib/i18n.ts` dictionary + `t()` helper. Language in settings. All page strings migrated |
| P1-8 🟢 | **Daily quests** | Each day auto-suggests 3 quests (from rules: 1 money, 1 pipeline, 1 growth). Accepting adds them |
| P1-9 🟢 | **Code-split routes** | `React.lazy` per page. Main chunk < 300 kB |
| P1-10 🟢 | **More achievements** | Add the list in `04-GAME-DESIGN.md` → "To add" |

## Phase 2 — Cloud sync between tablet and laptop (Weeks 3–5)
| ID | Ticket | AC |
|---|---|---|
| P2-1 🟡 | Supabase project + schema SQL in `supabase/migrations/` | Tables mirror Dexie with `user_id uuid`, `updated_at`, `deleted_at`. **RLS enabled** with `user_id = auth.uid()` |
| P2-2 🟡 | Dexie v3 (next free version): add `updatedAt`, `deletedAt` to all syncable tables | Upgrade backfills. All writes go through helpers that set `updatedAt` |
| P2-3 🟡 | Auth (magic link email) | Settings → "Sign in to sync". Session persisted |
| P2-4 🔴 | Sync engine `src/sync/` | Push/pull by `updatedAt`, last-write-wins, tombstones, ledger union. Runs on focus + every 60 s + debounced after writes. Status indicator in HUD. Tests with two simulated clients |
| P2-5 🟢 | Env config | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env.local` (never commit). `.env.example` committed |

## Phase V — v2 economy and money engine (approved 2026-11-06)
From `09-EVALUATION.md` (decisions D-1 to D-7). One commit per ticket. Sizes: (S) ≤ 1 h, (M) 1–3 h, (L) split into several commits. Each follows the Definition of Done in `AGENTS.md`.

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
| P4-4 🟡 | Seasons + boss fight | Season entity, progress track, boss with HP damaged by focus hours |
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
