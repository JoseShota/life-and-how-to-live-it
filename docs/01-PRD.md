# 01 · Product Requirements — Life and How to Live It

## Product
**Life and How to Live It** is a personal "life RPG". It's an installable web app (PWA) for one user, for use on a **tablet and a laptop**. It tracks work across 7+ activities, a daily routine, and personal finances, and rewards every good action with XP, coins, levels and achievements.

## User
One person: an economist with no steady job who teaches at CIDE, works at Weaving Memories, freelances in web development, is learning AI automation, and has hobbies (video, writing, personal website). Uses **Banorte**: 1 debit card and 3 credit cards. Currency: **MXN**. Timezone: America/Mexico_City.

## Goals
1. **Clarity.** In 5 seconds, the Today screen answers *"what should I do now, and how am I doing?"* (the Now card, then the three rings).
2. **Consistency.** Make the routine (5:45 wake, 7.5 h sleep, exercise, clean, intel, 8 h work, money check-in) sticky through game mechanics.
3. **Wealth.** Know net worth, card status and savings rate, and **which activity pays most per hour**.
4. **Joy.** It should feel like a game you *want* to open: snappy, animated, rewarding.

## Non-goals (for now)
- Multi-user, social features, sharing.
- Live bank connections (no open-banking API for Banorte in scope). Import comes later via CSV/PDF.
- Native iOS/Android apps (the PWA covers tablet + laptop).

## Principles
- **Offline-first, local-first.** Works with no internet. Data never leaves the device until sync is built and enabled.
- **Ledger, not counters.** XP and coins are always *derived* from an append-only event ledger, so they're reversible and auditable.
- **Reward behavior, not outcomes.** Finance XP is for logging, paying in full and saving, never for the *size* of income.
- **One-tap logging.** Any daily action takes at most 2 taps.
- **Touch-first.** Tap targets ≥ 40 px, bottom nav on tablet, sidebar on laptop.

---

## MVP (v0.1). ✅ Built in this repo

| # | Feature | Acceptance criteria |
|---|---|---|
| M1 | **Today dashboard** | Rings for routine (x/7), deep work (h/target), XP today. Today's quests (priority "Today" or due ≤ today). Daily routine checklist. Ideal-day timeline highlighting the current block. Today's XP log. Card payment alerts (≤ 5 days, with debt) |
| M2 | **Areas & quests** | 8 seeded areas (7 activities + Wealth & admin) with weekly-hour targets. Create/edit/delete quests with area, difficulty (5 levels → XP), priority, due date, notes. Complete/reopen (XP reversible). Filter by area. Onboarding quest line seeded |
| M3 | **Routine habits** | 7 seeded habits: wake, sleep (number: hours), exercise, clean, intel, deep work (auto from Focus), money check-in. Streak counter, streak multiplier, Perfect Day bonus |
| M4 | **Focus timer** | Start/stop timer per area (+ optional quest). Survives reload. Floating pill while running. Manual time entry. Sessions list with delete. XP 5 per 15 min. Full workday bonus at target |
| M5 | **Money** | Accounts (Banorte debit, 3 credit cards, cash) with limit/cut-off/pay-by day. Income/expense/transfer (incl. card payment). Net worth, card debt, monthly income, savings rate. Card utilization + days to due. Spending pie. **Wealth engine** (MXN/h per activity, 90 d). **Opportunity pipeline** (expected value). **Wealth goals** |
| M6 | **Game layer** | Ledger-based XP/coins, level curve + titles, HUD, reward toasts, 9 achievements, the Agora (reward shop) with custom rewards |
| M7 | **Archive** | 30-day habit heatmap, 7-day hours by area (stacked), 30-day XP chart |
| M8 | **Settings & data** | Player name, daily work target, area names/hours, `.ics` routine export, notification permission, JSON export/import, reset |
| M9 | **PWA** | Installable, offline (service worker), app icon, standalone display |

## Phase roadmap (detail in `05-ROADMAP.md`)
- **P1 Polish & personal fit.** Recurring quests, sub-tasks, edit habits in UI, onboarding wizard, Spanish UI toggle, sound/haptics, weekly review screen.
- **P2 Cloud sync.** Supabase auth + sync so tablet and laptop share data automatically.
- **P3 AI Coach.** Natural-language quick add ("gasté 230 en tacos con crédito 2"), daily briefing, weekly review, newsletter digest.
- **P4 Reminders & game depth.** Web push reminders, HP/streak shields, seasons and boss fights, Google Calendar sync.
- **P5 Wealth pro.** Banorte statement import (CSV/PDF), recurring transactions, budgets, investments, net-worth history, projections simulator.

## Success metrics (personal)
- Good-or-Perfect-Day rate ≥ 60 % over 30 days (a Perfect Day is a rare stretch; see `09-EVALUATION.md`).
- Deep-work "done" target (6 h weekdays, 4 h weekends) met on ≥ 60 % of days; ≥ 30 h of focus per week.
- 100 % of card statements paid in full (the *pago para no generar intereses*, by the due date).
- Savings rate ≥ 20 % (month 3), ≥ 30 % (month 6).
- MXN/h of the top monetizable activity rising quarter over quarter.
