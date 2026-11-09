# 04 · Game Design — Life as an RPG

## Core loop
```
  Plan (top 3 quests) → Act (focus / habits / log money) → Reward (XP + coins + toast)
        ▲                                                         │
        └──── Spend coins on real treats ◄── Level up / achievements ┘
```
**Design pillars**
1. **Immediate feedback.** Every action gives a toast, a ring that fills, and a number that goes up.
2. **Reward the process, not luck.** XP for doing the work (habits, focus, logging), never for how big a paycheck is.
3. **Forgiving, not punishing.** No XP is ever taken away for missing a day. Streaks reset, but the "never miss twice" rule and (P4) streak shields soften it.
4. **Real-world payoff.** Coins buy real rewards *you* define. You enjoy a treat only after you've paid for it in coins.

## Currencies
| Currency | Earned by | Used for |
|---|---|---|
| **XP** | Everything | Levels and titles (never spent) |
| **₯ Drachmae (coins)** | ≈ 1 per 5 XP | Agora |

## XP table (v2, economy B; tune in `src/game/rules.ts`)
| Action | XP | Coins |
|---|---|---|
| Quest: Trivial / Easy / Medium / Hard / Epic | 5 / 15 / 35 / 75 / 150 (only the first Epic each day pays Epic) | XP ÷ 5 |
| Habit (check) | habit.xp (rituals 5–20, core 15–25) × streak multiplier | XP ÷ 5; **0 for intrinsic habits** (intel) |
| Streak multiplier | +5 % per full 7-day streak, max +50 % | |
| Focus | 20 XP/h, pro-rata per minute, **only up to the day's full target** | XP ÷ 5; **0 for hobby areas** |
| Deep-work habit ("done" target) | 40 × streak multiplier | XP ÷ 5 |
| Full workday ("full" target) | 30 | 6 |
| **Good Day** (3 of 4 core habits, min versions count) | 25 | 5 |
| **Perfect Day** (all 4 core habits, full versions) | 60 | 12 |
| **Weekly scorecard** (3 of 4: focus ≥ 30 h, exercise ≥ 4 days, money check-in ≥ 5 days, ≥ 5 Good/Perfect days) | 150 | 30 |
| Log a transaction | +2 (daily cap 20) | 1 |
| Pay a card statement in full (the *pago para no generar intereses* by the due date) | +50 once per statement | 10 |
| Wealth goal progress | +25 (once per goal per month) | 5 |
| Savings deposit (transfer into the shield or investments, e.g. from "split it") | +25, max 4 a month | 5 |
| **Income engine** (Treasury → Pipeline, one tap): conversation / proposal / case study | 15 (max 45 a day) / 40 / 75 | XP ÷ 5 |
| Lead moves to a new stage | +10 once per lead and stage | 2 |
| **Weekly review** (`/review`; 3 wins and 3 quests for next week, current review week only) | 50 once per week | 10 |
| Achievement | 25–500 | XP ÷ 5 |
| Wealth level (Treasury → The Road) | 150 / 250 / 400 / 600 / 1,000 for levels 1–5, once | XP ÷ 5 |

**Deep-work targets** (Settings), in hours:

| Day | Done | Full (bonus, focus XP stops) |
|---|---|---|
| Weekday | 6 | 8 |
| Weekend | 4 | 6 |
| Teaching day (approved 2026-11-07) | 4 | 5 |

A **teaching day** is one of the teaching schedule's weekdays inside its semester (Control → Teaching days); it wins over weekday/weekend. 5 h is the focus window before leaving; done stays about 75 % of full. Prep and grading are focus (logged on the teaching area); **the class is not focus time**: it pays in the real MXN/h, not in XP. The weekly scorecard stays at 30 h. When the schedule changes, past days (up to today) whose teaching status changed and that have focus logged are re-graded, oldest first, so their habit, bonus and focus XP follow the schedule; a toast says how many.

**Core habits:** sleep, exercise, deep work, money check-in. **Rituals** (XP, not core): up by 5:45, clean, intel, eat well.

**Habit editor (P1-3, Control → Habits; the pencil on Today opens the same sheet):**
- **Every habit:** name, icon, minimum version (not deep work: its minimum is 2 h of focus), plan, and its place in the order (up/down, inside Core or Rituals). The order is the order on Today.
- **Core is fixed on every habit.** The 4 core habits decide Perfect and Good Days, so their XP and dr are fixed and they can't be archived; a ritual never becomes core. The sleep target and a habit's kind never change.
- **Rituals:** XP of 5, 10, 15 or 20 (`RITUAL_XP_CHOICES` in `rules.ts`; capped at 20 so no ritual outweighs the core habits) and "I already enjoy it" (XP, no dr). Changes apply from the next check-off; XP already earned stays.
- **Add a ritual:** a tick-box habit, 10 XP by default, placed last. **Archive** hides a ritual from Today and Stats and keeps its history; restore it from Archived. **Delete** only for a habit you added that was never checked.
- The card shows the rituals' XP a day at base: a few kept daily beat many kept rarely.

**Habit science (V-3):**
- **Minimum version** per habit (Tiny Habits): keeps the streak, pays half XP, counts for a Good Day but never a Perfect Day. Deep work's minimum is 2 h of focus (automatic).
- **Plan** per habit: a "When…, I will…" line (implementation intention), editable with the pencil.
- **Yesterday:** the routine can be logged for the previous day (sleep is known the morning after).
- **Streak shields:** earned every 7 Good-or-Perfect days in a row (hold 2). When the app opens, a shield covers each core habit missed yesterday whose streak was alive, in routine order. A shielded day doesn't add to the streak, it just doesn't break it.

**A perfect weekday** ≈ 105 (habits) + 160 (8 h focus) + 30 (full workday) + 60 (perfect) + ~85 (quests) ≈ **440 XP ≈ 90 coins**. A realistic week earns about 330–390 dr (`scripts/eval-sim.ts`).

**Weekly review (P1-4).** It covers the same Mon–Sun week as the scorecard: on Sunday the week ending today, on any other day the last finished week (so you have until Saturday). Incentive design: 50 XP is a third of the scorecard on purpose (the week's outcome is worth more than planning it) and pays only for a real review (3 wins written, 3 quests chosen). Old weeks can be saved and edited but never pay, so there's no backfilling. Deleting a review, or emptying it, takes the XP back.

**Repeating quests (P1-1).** A quest can repeat every day, week or month (Quest form, "Repeats"). Completing it creates the next instance, due one period after the current due date; missed periods are skipped so the next one isn't born overdue. Each instance is a normal quest and pays its own XP. Reopening removes the next instance if it's untouched. The RESICO monthly declaration is a monthly series that never skips a month (every month must be filed); its estimate refreshes from the ledger each time the app opens while the quest is open. The estimate is shown read-only in the quest form; your own notes sit below it and are never overwritten.

## Levels
`xpForLevel(n) = 50 × (n − 1)^1.8` (total XP needed to reach level *n*).

Level 1 title: Neophyte. Levels show as Roman numerals in the HUD.

| Level | Total XP | ≈ perfect days | Title |
|---|---|---|---|
| 5 | 606 | 1 | Ephebe |
| 10 | 2,610 | 5 | Hoplite |
| 20 | 10,017 | 18 | Strategos |
| 30 | 21,443 | 39 | Archon |
| 40 | 36,550 | 66 | Magnate |
| 50 | 55,122 | 100 | Philosopher-King |

Level 50 ≈ 100 perfect days, about a year of real consistency. That's on purpose. A realistic first 90-day season ends around level 28–31 (`09-EVALUATION.md`).

## Integrity rules (V-1)
- Focus sessions can't overlap time already logged, and one session counts 12 h at most. After 3 h the Focus screen asks "still working?" and lets you log the real end time.
- Only the first Epic quest of the day pays Epic XP; later ones pay Hard. An Epic needs a "done means…" note.
- Achievements are re-locked, and their XP revoked, when what earned them is undone.
- Wealth-goal progress pays once per goal per month.

## Achievements (MVP)
First Blood, Questmaster (50 quests), Perfect Day, Perfect Week (7 total), Dawn Patrol (7-day wake streak), Centurion (100 h focus), Grinder (5 full workdays), Steady Hand (30 Good or Perfect days), Scorecard (first weekly scorecard), Totalero (3 statements in a row paid in full on time), Rainmaker (first retainer won), Agora Regular (20 conversations), Bookkeeper (30 transactions), Paid (income linked to an activity).

**To add (P1/P4):** Iron Body (30-day exercise streak), Debt Slayer (all cards at 0 for 3 statements), Shieldbearer (1-month fund), Fortress (6-month fund), Rainmaker (first retainer), Polymath (hours in all 8 areas in one week), Night Owl Reformed (21 nights in bed by 21:45), Season Champion.

## Reward economy guidelines
- Small treat (coffee, episode): 40–60 coins → about one realistic day.
- Medium (dinner out, book): 250–300 → about 5 realistic days.
- Big (day off, gadget): 1,000+ → about 3 realistic weeks.
- If you're hoarding coins, your rewards are too expensive or not fun. If you're always broke, they're too cheap.

## Seasons and fresh starts (E-9)
Fresh starts (Dai, Milkman and Riis 2014): goals get a lift after a landmark day, so Today marks them. None of this pays XP.
- **The season.** Season 1 is the 90-day campaign of `00-MASTER-PLAN.md` §6. Its start date is a synced setting (`season`), set in Control, so both devices show the same week. Day 1 is the start date and day 90 the last.
  - Weeks follow the Mon–Sun weeks of the weekly review and scorecard: week 1 is the week holding the start date (shorter when the season starts mid-week). After week 12, the days left until day 90 are the season review.
  - Today's Season banner: "Season 1 · week N of 12 · day D of 90", the phase focus and its "done when" line, and the boss. Before the start it counts down; without a date it links to Control.
  - Boss: first retainer client + 1-month emergency fund + 30-day Good-or-Perfect rate ≥ 60 %. Since P4-4 the banner shows each part with a bar, from real data (display only, no XP):
    - **Retainer:** an opportunity of kind `retainer` marked won.
    - **Emergency fund:** the shield bucket against a month of spending, the same numbers as Wealth Road (`finance/wealth.ts`).
    - **Good-or-Perfect rate:** Good and Perfect Days in the ledger over the last 30 complete days (today doesn't count until it's over), never before the season start. Until 30 days have passed it reads "N of 30 days so far" and can't be met.
    - When all three are met the panel reads "Boss defeated". A reward for it, and boss HP damaged by focus hours, would change the economy: ask first.
- **One fresh-start banner at a time**, in this order:
  1. Sunday: the weekly review, until it pays.
  2. Monday: if last week's review isn't saved, a link to it (it still pays until Saturday); otherwise the 3 quests it chose.
  3. The first 3 days of a month: last month's income, spending and savings rate, a reminder to split income, and the RESICO estimate due on the 17th.
  - The Monday and month banners close with an X, on both devices (the synced setting `freshStartDismissed` keeps the latest closed keys, such as `week:2026-11-16` or `month:2026-12`). The Sunday review card has no X: it goes when the review pays.
- **Not in E-9:** a coin wager on the weekly scorecard (an economy change; a Season 2 experiment, next to Option C) and a separate monthly screen.
- Rules: `src/game/season.ts` (pure, `tests/season.test.ts`). UI: `src/components/SeasonBits.tsx`.

## Planned mechanics
| Mechanic | Phase | Description |
|---|---|---|
| **HP / Energy** | P4 | Starts at 100. Missing core habits drains HP, sleep and exercise restore it. At 0 HP: "recovery mode" (only the minimum-viable versions are required for 3 days). No XP loss |
| **Streak shields** | done (V-3) | Earned every 7 Good-or-Perfect days in a row, max 2. Auto-consumed to protect a streak on a missed day |
| **Seasons** | E-9 banner and P4-4 boss progress done | 90-day campaigns with a theme, a season pass track and a final **boss fight** (e.g. "First retainer + 1-month fund"). Since E-9 the banner and the plan text exist; live boss progress is P4-4 |
| **Weekly bosses** | P4 | A big quest (Epic) that you damage with focus hours in its area |
| **Daily quests** | P1 | 3 auto-generated quests from routine/wealth plan ("Contact 1 lead", "Log all expenses") |
| **Loot drops** | P4 | 10 % chance of bonus coins on completing a Hard/Epic quest |
| **Sound & haptics** | P1 | Short sounds on complete/level-up, `navigator.vibrate` on Android |
| **Level-up screen** | P1 | Full-screen celebration with the new title and unlocked perks |
