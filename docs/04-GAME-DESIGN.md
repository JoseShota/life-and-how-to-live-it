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
| Habit (check) | habit.xp (10–25) × streak multiplier | XP ÷ 5; **0 for intrinsic habits** (intel) |
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
| Achievement | 25–500 | XP ÷ 5 |
| Wealth level (Treasury → The Road) | 150 / 250 / 400 / 600 / 1,000 for levels 1–5, once | XP ÷ 5 |

**Deep-work targets** (Settings): weekdays 6 h = done, 8 h = full; weekends 4 h = done, 6 h = full.

**Core habits:** sleep, exercise, deep work, money check-in. **Rituals** (XP, not core): up by 5:45, clean, intel.

**A perfect weekday** ≈ 105 (habits) + 160 (8 h focus) + 30 (full workday) + 60 (perfect) + ~85 (quests) ≈ **440 XP ≈ 90 coins**. A realistic week earns about 330–390 dr (`scripts/eval-sim.ts`).

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
First Blood, Questmaster (50 quests), Perfect Day, Perfect Week (7 total), Dawn Patrol (7-day wake streak), Centurion (100 h focus), Grinder (5 full workdays), Steady Hand (30 Good or Perfect days), Scorecard (first weekly scorecard), Totalero (3 statements in a row paid in full on time), Bookkeeper (30 transactions), Paid (income linked to an activity).

**To add (P1/P4):** Iron Body (30-day exercise streak), Debt Slayer (all cards at 0 for 3 statements), Shieldbearer (1-month fund), Fortress (6-month fund), Rainmaker (first retainer), Polymath (hours in all 8 areas in one week), Night Owl Reformed (21 nights in bed by 21:45), Season Champion.

## Reward economy guidelines
- Small treat (coffee, episode): 40–60 coins → about one realistic day.
- Medium (dinner out, book): 250–300 → about 5 realistic days.
- Big (day off, gadget): 1,000+ → about 3 realistic weeks.
- If you're hoarding coins, your rewards are too expensive or not fun. If you're always broke, they're too cheap.

## Planned mechanics
| Mechanic | Phase | Description |
|---|---|---|
| **HP / Energy** | P4 | Starts at 100. Missing core habits drains HP, sleep and exercise restore it. At 0 HP: "recovery mode" (only the minimum-viable versions are required for 3 days). No XP loss |
| **Streak shields** | P4 | Earned every 14-day streak. Auto-consumed to protect a streak on a missed day |
| **Seasons** | P4 | 90-day campaigns with a theme, a season pass track and a final **boss fight** (e.g. "First retainer + 1-month fund") |
| **Weekly bosses** | P4 | A big quest (Epic) that you damage with focus hours in its area |
| **Daily quests** | P1 | 3 auto-generated quests from routine/wealth plan ("Contact 1 lead", "Log all expenses") |
| **Loot drops** | P4 | 10 % chance of bonus coins on completing a Hard/Epic quest |
| **Sound & haptics** | P1 | Short sounds on complete/level-up, `navigator.vibrate` on Android |
| **Level-up screen** | P1 | Full-screen celebration with the new title and unlocked perks |
