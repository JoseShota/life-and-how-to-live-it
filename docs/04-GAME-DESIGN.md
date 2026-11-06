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

## XP table (tune in `src/game/rules.ts`)
| Action | XP |
|---|---|
| Quest: Trivial / Easy / Medium / Hard / Epic | 5 / 15 / 35 / 75 / 200 |
| Habit (check) | habit.xp (10–25) × streak multiplier |
| Streak multiplier | +5 % per full 7-day streak, max +50 % |
| Focus session | 5 XP per 15 min (20 XP/h) |
| Full workday (≥ target hours) | 60 + 40 (habit) |
| 🌟 Perfect Day (all core habits) | +100 |
| Log a transaction | +2 (daily cap 20) |
| Pay a credit card in full | +50 |
| Wealth goal progress | +25 |
| Achievement | 25–500 |

**A perfect weekday** ≈ 125 (habits) + 160 (8 h focus) + 100 (workday) + 100 (perfect) + ~80 (quests) ≈ **550 XP ≈ 110 coins**.

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

Level 50 ≈ 100 perfect days, about a year of real consistency. That's on purpose.

## Achievements (MVP)
First Blood, Questmaster (50 quests), Perfect Day, Perfect Week (7 total), Dawn Patrol (7-day wake streak), Centurion (100 h focus), Grinder (5 full workdays), Bookkeeper (30 transactions), Paid (income linked to an activity).

**To add (P1/P4):** Iron Body (30-day exercise streak), Debt Slayer (all cards at 0 for 3 statements), Shieldbearer (1-month fund), Fortress (6-month fund), Rainmaker (first retainer), Polymath (hours in all 8 areas in one week), Night Owl Reformed (21 nights in bed by 21:45), Season Champion.

## Reward economy guidelines
- Small treat (coffee, episode): 40–60 coins → about half a good day.
- Medium (dinner out, book): 250–300 → 2–3 good days.
- Big (day off, gadget): 1,000+ → about 2 weeks.
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
