# 09 · Deep Evaluation: game, habits and money design

*Written 2026-11-06 for the deep-evaluation handoff (`docs/handoffs/2026-11-06-evaluation.md`, on branch `claude/inspiring-darwin-iz7x9q`). Baseline: `main` at `b7e8189`.*

**This is an evaluation, not a refactor.** Nothing in `src/`, `src/game/rules.ts`, the schema or `00-MASTER-PLAN.md` changed. Every proposal below is an option or a ticket waiting for the user's approval.

**How the evidence was gathered**
- **Code:** the game, engine, finance code and every page were read in full.
- **Simulation:** `scripts/eval-sim.ts` imports the real pure functions from `src/game/rules.ts`, mirrors `engine.ts`, and plays 90 days for 6 schedules, averaged over 20 random seeds. Run it with `npx vite-node scripts/eval-sim.ts`.
- **Browser:** a Playwright walkthrough of the production build at 820 px (touch) and 1366 px. Screenshots are in `docs/eval/`.
- **Literature:** web-verified sources, linked in section 5.
- **Intake:** the user answered the intake questions in chat. Their answers informed the calibration (the "6 h weekdays, 2.5 h weekends" scenario and the v2 targets), but at the user's request no personal figure from them appears in this repo.

---

## 0. Decisions (2026-11-06, approved by the user)

| # | Decision | Detail |
|---|---|---|
| D-1 | **Economy: Option B** | Exploit fixes, Good Day tier, weekly scorecard, leading-indicator rewards. Option C (coins backed by the fun budget) stays a Season 2 experiment |
| D-2 | **Deep work: done and full targets** | Weekdays: 6 h = done (habit XP), 8 h = full (workday bonus). Weekends count: 4 h = done, 6 h = full. Focus XP stops at the full target of the day |
| D-3 | **4 core habits** | Sleep, move (exercise), deep work, money check-in. Wake, clean, intel become rituals (XP, not core). Hobbies and intel earn XP but no coins |
| D-4 | **Exact card statements, bank presets** | Each card stores its statements with the exact amounts (statement balance, *pago para no generar intereses*, minimum, MSI). Banorte is the first preset (payment due 20 days after the cut-off); every future bank or card follows the same model |
| D-5 | **Wealth levels with unlocks** | Levels unlock phases of the plan. Investing unlocks in two steps: a 3-month shield starts a small automatic investment (25 % of the savings bucket), a 6-month shield sends the whole bucket to investments. Rationale in section D4 |
| D-6 | **Tax module: RESICO first** | Invoices with IVA and withholdings, a monthly ISR and IVA estimate due on the 17th, the 3.5 M cap, the April annual return, and an exact tax reserve in the "split it" sheet. The tax regime is a setting; every number is labeled an estimate |
| D-7 | **Banxico** | The 5 Nov 2026 decision cut the target rate to 6.25 % (confirmed by the user) |

With D-2 the approved targets are stricter than the proposal in E2 (which used a 4 h weekday floor). The rerun of `scripts/eval-sim.ts` with the approved rules, plus a deep-work "min version" (2 h counts for the streak and Good Day, never for Perfect Day):

| Scenario | Perfect-Day rate | Good-Day rate | Perfect + Good | Weekly bonus hit | XP 90 d | Level d90 | Coins / week |
|---|---|---|---|---|---|---|---|
| Realistic (2 teaching days) | 3 % | 60 % | **63 %** | 30 % | 20,719 | 29 | 335 |
| Realistic + 1 bad week/month | 2 % | 49 % | 51 % | 20 % | 17,864 | 27 | 289 |
| 6 h weekdays, 2.5 h weekends, sleep/exercise shaky | 6 % | 52 % | **58 %** | 45 % | 24,112 | 31 | 387 |
| Ideal weekdays, real weekends | 72 % | 10 % | 82 % | 100 % | 37,962 | 40 | 608 |

Perfect Days are now rare by design (a real stretch), and the metric that should reach about 60 % is **Good-or-Perfect days**. The tickets that implement these decisions are Phase V in `05-ROADMAP.md`.

### Implementation status (2026-11-06)
All Phase V tickets are built, one commit each, with tests (91 → 92 with the upgrade test) and browser checks at 820 and 1366 px:

| Ticket | Closes findings | What changed |
|---|---|---|
| V-1 Integrity | #2, #8 | Overlapping focus refused, 12 h session cap, one full Epic a day, achievements re-lock, goal XP monthly |
| V-2 Economy B | #1, #3 (part), #11 | Done/full deep-work targets, focus XP capped at the full target, 4 core habits, Good Day, weekly scorecard, no coins for hobbies and intel |
| V-3 Habit science | #10, #13 (part) | Minimum versions, if-then plans, log yesterday, streak shields, Eat well |
| V-4 Card statements | #2, #4 | Exact statements per card with bank presets (Banorte +20 days), MSI plans, reward per statement paid in full on time |
| V-5 Wealth levels | #7 (part) | Bucket roles, levels 1–5 from real data, investing unlocks at 3 and 6 months of spending |
| V-6 RESICO + split it | #6, #7 | Invoice tax fields, monthly ISR/IVA estimate, exact reserve, filing quests, SMarT step |
| V-7 Leading indicators | #3 | One-tap conversations, proposals, case studies; stale leads; Rainmaker |
| V-8 Usability | #5, #9, #12, #13, #15, #16 | Now card, tap targets, plain names, category memory, savings-rate edge cases, redeem undo |

Not done (still open): Option C (coins backed by the fun budget), and a real-hourly-wage column in the Wealth Engine (E-10).

### Season 1 essentials (2026-11-07)
| Ticket | What changed |
|---|---|
| P1-4 Weekly review | `/review` (menu, and a card on Today on Sundays): Good-or-Perfect rate, scorecard, hours per area vs target, money in/out and savings rate, statements due, wealth level progress, conversations/proposals/case studies, 3 wins and next week's 3 quests, backup export. Dexie v8 `reviews`. +50 XP once per week (`REVIEW_XP`, new constant), only for a complete review of the current review week |
| P1-1 Repeating quests | Daily, weekly or monthly quests (Dexie v9 `recurrence`); completing one creates the next with a deterministic id; the RESICO declaration is a monthly series that never skips |

### D4. Why investing unlocks at 3 and 6 months
- Irregular income needs a buffer: Housel's room for error and the master plan both point at 6 months.
- The shield sits in CETES (28-day 6.50 % on 3 Nov 2026), so waiting costs little in nominal return.
- Under RESICO there is no PPR or voluntary AFORE deduction, so there is no tax reason to rush.
- Starting small at 3 months builds the investing habit early, as Save More Tomorrow does with savings rates.

---

## 1. Summary

### Scorecard

| # | Question | Grade (1–5) | One-line verdict |
|---|---|---|---|
| 1 | **Game logic.** Is the game enough for the master plan? | **2** | The loop is sound and every reward can be undone. But the headline goal (Perfect Day) almost never happens, and four exploits make the score unreliable. |
| 2 | **Understandability.** Can you tell in 5 seconds what to do and how you're doing? | **3** | "How am I doing" is clear (three rings). "What should I do now" is not: the current block of the Ideal Day is far below the fold, and nothing says "do this next". |
| 3 | **Behavior and money science.** Is it built to create habits and solvency? | **2** | It has some evidence-based parts (immediate feedback, streaks, the MXN-per-hour table). It's missing the strongest ones: minimum viable versions, streak protection, implementation intentions, automation, a statement-based card model and an emergency-fund-first flow. |
| 4 | **Incentives and goals.** Are the incentives good enough? | **2** | XP pays for hours and self-reports, not for the income engine the plan calls "the real game". Finance is 2–4 % of XP. Coins are not tied to real money. |

### The 5 most important findings
1. **Perfect Day doesn't happen in realistic weeks** (0 % in the realistic schedules, 1 % at 6 h/day; section A2). It needs all 7 core habits, including 8 h of deep work, every day of the week. The PRD's "Perfect-Day rate ≥ 60 %" can't be reached. All-or-nothing goals invite the "what-the-hell" effect (Polivy and Herman).
2. **The score can be gamed in 5 minutes.**
   - Overlapping manual focus entries are accepted: the same 09:00–17:00 block logged twice reads "16h 00m of 8h". Confirmed in the browser.
   - A 1 MXN "payment" to a card with zero debt pays +50 XP each time, with no cap. Confirmed in the browser.
   - Each "Update" on a wealth goal pays +25 XP, whatever the amount.
   - Quest difficulty is self-assigned (an Epic is 200 XP).
   - Achievements are never taken back once unlocked.
3. **Incentives point at hours, not at the income engine.** Focus time and habits are 76 % of XP in a realistic week. Finance is 4 %, and leading indicators get 0 %: conversations, proposals, case studies and pipeline value earn nothing. Hobby hours count toward "Deep work 8 h".
4. **The card model doesn't match how Mexican cards work.** The app knows only a running balance, not the *pago para no generar intereses* (the amount on the statement at the cut-off date).
   - Someone who pays that amount in full every month (a *totalero*) still sees "Card debt" in red.
   - They only get "Paid in full" if they also pay off purchases made after the cut-off.
   - CONDUSEF's guidance, and the plan's own Level 1, are about exactly that statement amount.
5. **Today fails the "what now" half of the 5-second test, and some tap targets break the house rule.**
   - The sticky header plus marquee is 130 px tall.
   - The XP ring's 300 target isn't explained.
   - At ≥ 768 px (the tablet), the top nav items are 32 px tall, and the quest row's Complete, Focus and Edit buttons are 32 × 32. `AGENTS.md` requires at least 40 px.

### Top decisions for the user (details in section E)
1. **Which v2 economy:** A (fix and retune), **B (A plus leading indicators, Good Day, weekly scorecard; recommended)** or C (B plus coins backed by the fun budget).
2. **The deep-work target:** keep a single 8 h target, or use a **floor plus a target** (4 h counts as done, 6 h earns the full workday bonus, nothing beyond 8 h; weekends count with a smaller floor)?
3. **The core habits:** shrink Perfect Day from 7 habits to **4 keystones** (sleep, move, deep work, money check-in), and move intel, clean and wake to non-core "rituals"?
4. **Card model:** add statement tracking (a schema change, version n+1) so the reward and alerts follow the *pago para no generar intereses*.
5. **Tax regime question for the contador:** RESICO vs *actividades profesionales*. Under RESICO you can't take the personal deductions in LISR art. 151, including PPR and voluntary AFORE contributions. The master plan currently suggests both.

---

## 2. Sections A–E

### A. Game logic

#### A1. Every XP and coin flow

| Source | Where | XP | Coins | Cap | Undo path | Notes |
|---|---|---|---|---|---|---|
| Quest done | `completeTask` | 5 / 15 / 35 / 75 / 200 by difficulty | XP ÷ 5 | none | `reopenTask` revokes `task:<id>` | Difficulty is self-assigned. Creating and completing a quest has no friction |
| Habit (check, number) | `setHabit` | `habit.xp` × streak multiplier (+5 % per full week, max +50 %) | XP ÷ 5 | 1 per habit per day | Re-tap revokes `habit:<id>:<date>` | Today only, so you can't log yesterday (finding U-8). No time check on "Up by 5:45" |
| Deep-work habit + workday bonus | `evaluateDay` | 60 + 40 = 100 when focus ≥ target | 20 | 1 per day | Revoked if sessions drop below target | Any area counts, including hobbies |
| Focus session | `logSession` | `floor(min/15) × 5` | XP ÷ 5 | **none** | `deleteSession` | 50-min sprints pay 15 XP (18 XP/h, not the 20 XP/h on the label). **Manual entries can overlap.** A timer left running counts |
| Perfect Day | `evaluateDay` | 100 | 20 | 1 per day | Revoked if a core habit is unchecked | All 7 core habits |
| Log transaction | `rewardTransactionLogged` | 2 | 1 (explicit) | 20 XP per day | Delete revokes `tx:<id>` | Fine |
| Card "paid in full" | `TxForm.save` (Money page) | 50 | 10 | **none** | Delete revokes | Pays whenever the card's running balance is ≥ 0 after any transfer, **including 1 MXN to a card with no debt** |
| Wealth-goal progress | `GoalRow` (Money page) | 25 | 5 | **none** | **None.** The refId is `goal:<id>:<timestamp>`, and lowering the goal doesn't revoke | Any increase, even 1 MXN, pays. Lowering it and raising it again pays again |
| Achievement | `checkAchievements` | 25–500 | XP ÷ 5 | once | **None**, never revoked | `Perfect Week` is really "7 Perfect Days in total" |
| Reward | `redeem` | 0 | −cost | balance ≥ cost | **None**, no confirmation | The only coin sink |

**Other logic findings**
- **G-1.** `award()` is also called from a page component (`Money.tsx`). That bypasses the engine, which is why the card and goal rules have no caps. `AGENTS.md` says XP goes through `award()`, which it does, but the business rules belong in `engine.ts`.
- **G-2.** Achievements check counts of rows, not unique outcomes. For example, "Bookkeeper" counts every transfer as 2 transactions (one per leg), so 15 card payments unlock it.
- **G-3.** The streak multiplier only kicks in after 7 days (+5 %) and reaches its maximum after 70 days. Its first step is +1 XP on a 20 XP habit, so it's barely visible as a motivator. Duolingo's lesson is that streak protection matters more than streak multipliers (section C).

#### A2. 90-day simulation

Assumptions (per day, independent): the chance of doing each self-reported habit, the focus hours (normally distributed), the quests completed and the transactions logged. The "realistic" schedule has 2 teaching days a week. The "6 h weekdays" schedule has stronger work but shakier sleep and exercise. Averages are over 20 seeds. v2 is Option B from section E.

**v1 (current rules)**

| Scenario | Focus h/day | Perfect-Day rate (all / weekdays) | Full workdays | XP 90 d | Level d30 / d60 / d90 | Coins / week |
|---|---|---|---|---|---|---|
| All ideal (7/7) | 8.0 | 100 % / 100 % | 90 | 51,878 | 26 / 38 / 48 | 829 |
| Ideal weekdays, real weekends | 6.2 | 72 % / 100 % | 65 | 38,505 | 22 / 33 / 41 | 615 |
| Realistic (2 teaching days) | 3.9 | **0 % / 0 %** | 0 | 16,506 | 14 / 21 / 26 | 270 |
| Realistic + 1 bad week/month | 3.5 | **0 % / 0 %** | 0 | 14,261 | 13 / 19 / 24 | 233 |
| 6 h weekdays, 2.5 h weekends, sleep/exercise shaky | 5.1 | **1 % / 1 %** | 6 | 19,034 | 15 / 22 / 28 | 308 |
| Bad weeks only | 2.0 | 0 % / 0 % | 0 | 7,036 | 9 / 13 / 16 | 114 |

**v2 (Option B, proposed)**

| Scenario | Perfect-Day rate | Good-Day rate | Perfect + Good | Weekly bonus hit | Full workdays | XP 90 d | Level d90 | Coins / week |
|---|---|---|---|---|---|---|---|---|
| All ideal (7/7) | 100 % | 0 % | 100 % | 100 % | 65 | 46,398 | 45 | 747 |
| Ideal weekdays, real weekends | 75 % | 9 % | 84 % | 100 % | 65 | 36,826 | 40 | 591 |
| Realistic (2 teaching days) | 17 % | 41 % | **58 %** | 38 % | 10 | 23,009 | 31 | 371 |
| Realistic + 1 bad week/month | 13 % | 32 % | 45 % | 26 % | 7 | 19,725 | 28 | 318 |
| 6 h weekdays, 2.5 h weekends, sleep/exercise shaky | 16 % | 41 % | **57 %** | 45 % | 32 | 26,047 | 33 | 417 |
| Bad weeks only | 1 % | 6 % | 7 % | 0 % | 0 | 9,245 | 19 | 148 |

**What it means**
- **Perfect Day (v1) is effectively unreachable.** Even with 8 h guaranteed, the six self-reported habits all happen on only 20 % of realistic weekdays (the product of their probabilities). The 8 h target then takes that to 0 %. The 4 h "sustainable ceiling" in the deep-work literature (Ericsson, Newport) makes 8 h a target you'd fail most days.
- **Level pace is OK; the table in `04` assumes perfection.** `04` says "Level 50 ≈ 100 perfect days". In the simulation, an all-ideal season reaches level 48 at day 90, while a realistic one reaches 26–28. Titles change at levels 1, 5, 10, 15, 20 and 30, so a realistic first season ends on "Strategos". That's fine: leveling isn't the problem.
- **XP mix (realistic, v1):** habits 39 %, focus 37 %, quests 19 %, finance 4 %, workday 1 %. On an ideal v1 day (545 XP), focus plus the workday bonus plus the Perfect Day bonus is 63 %. This confirms hypothesis 2 from the handoff.
- **Coins vs Agora prices.** A realistic week earns about 270 dr (v1).
  - **Small treat** (40–60 dr, "half a good day"): about one per day, which is reasonable.
  - **Medium** (250–300 dr, "2–3 good days"): about one per week, not one per 2–3 days.
  - **Big** (1,000 dr, "about 2 weeks"): about 3.7 weeks.
  - **Verdict:** the price guidelines in `04` assume ideal days. Either lower medium and big prices by about 30 % or adopt v2, where a realistic week earns about 370 dr.

#### A3. Exploits (current rules)

| # | Exploit | Yield | Confirmed | Fix (ticket) |
|---|---|---|---|---|
| X-1 | Log the same manual focus block repeatedly (overlaps accepted) | 160 XP per 8 h block, plus the 100 XP workday bonus | Browser: "Sessions · 16h 00m of 8h" (`docs/eval/*-03b-focus-overlap-exploit.jpg`) | E-1 |
| X-2 | 1 MXN transfer to a card with ≥ 0 balance = "Paid in full" | +50 XP each time, no cap | Browser: lifetime XP 447 → 547 after two 1 MXN payments (`*-05-treasury.jpg` shows the toasts and a +$2.00 card) | E-2 |
| X-3 | Goal "Update" with tiny increments, or lower then raise | +25 XP each, never revoked | Code (`Money.tsx` GoalRow) | E-2 |
| X-4 | Create and complete Epic quests | 200 XP each | Code | E-3 (soft cap plus review) |
| X-5 | Leave the timer running (forgot to stop) | 20 XP/h, unbounded | Code (`Focus.tsx` stop) | E-1 (12 h cap plus a "still working?" prompt) |
| X-6 | Unlock an achievement, then undo its cause | Keeps 25–500 XP | Code | E-3 |

Five minutes of tapping (X-1 ×3, X-2 ×10, X-3 ×10, X-4 ×10) yields about 3,330 XP and 666 dr, about 2.5 realistic weeks of play (a realistic v1 week earns about 1,280 XP). For a single honest user, an exploit isn't fraud. It's a **leak in the feedback signal**: once the number can be pushed by hand, it stops telling you how you're doing (Goodhart's law). The fixes are cheap.

---

### B. Understandability

The production build was walked through at 820 × 1180 (touch, the Android tablet in portrait) and 1366 × 768 (laptop), on a fresh first run. Screenshots are in `docs/eval/`:

| Screen | Tablet | Laptop |
|---|---|---|
| Today, first run (annotated) | `tablet-01-today-first-run.jpg` | `laptop-01-today-first-run.jpg` |
| Today, full page | `tablet-01b-today-full.jpg` | `laptop-01b-today-full.jpg` |
| Focus timer running | `tablet-03-focus-running.jpg` | `laptop-03-focus-running.jpg` |
| Overlapping manual focus (exploit X-1) | `tablet-03b-focus-overlap-exploit.jpg` | `laptop-03b-focus-overlap-exploit.jpg` |
| New expense | `tablet-04-log-expense.jpg` | `laptop-04-log-expense.jpg` |
| Treasury after the card exploit | `tablet-05-treasury.jpg` | `laptop-05-treasury.jpg` |
| Agora | `tablet-06-agora.jpg` | `laptop-06-agora.jpg` |

#### B1. 5-second test of Today
What's visible without scrolling, on both widths: the menu bar and HUD with the marquee (130 px), the page title, the date line, three rings (Routine 0/7, Deep work 0m / 8h, XP today 0), then "Quests of the Day" (5 onboarding quests on the tablet) and the top of "The Routine".
- **"How am I doing?"** Mostly yes. The rings are readable, though "XP today" fills against an unexplained 300.
- **"What should I do now?"** No.
  - The Ideal Day timeline, which knows the current block, is the third card: at 820 px it sits after 5 quests and 7 habits.
  - The rings say nothing about what to do next.
  - The first-run quests are all priority "Today", so 5 equally weighted items compete.
  - **Fix:** a single "Now" card above the rings (E-6).

#### B2. Cognitive walkthrough of 6 tasks

| Task | Taps (tablet) | Problems found |
|---|---|---|
| First run | 0 | No onboarding. Seeded cards have 0 limits, and the 5 seeded "Today" quests are the only guide. The Treasury shows "Set limit, cut-off & due day" (good), but Today doesn't |
| Log a peso | 3 + typing | Category defaults to **Rent** (the first item), so a quick log of a taco becomes "Rent". No recent-category memory. The button says "+2 XP" even after the daily cap is reached |
| Check a habit | 1 | Fast. Sleep only offers 6 / 7 / 7.5 / 8 h, with no 6.5 h, and it isn't clear whether it means last night or tonight. "Up by 5:45" can be ticked at any hour |
| Focus block | 3 (tab, start, stop) | Stopping before 15 min pays 0 XP with no warning. Manual entry can't pick a date (today only) and allows overlaps |
| Card payment | 4 + typing | Done through "Transfer / pay card", which is hard to find. The app doesn't show the statement amount (*pago para no generar intereses*). The "paid in full" reward follows the running balance, not the statement |
| Buy a reward | 1 | No confirmation and no undo, so a stray tap spends coins (110 → 70 in the walkthrough). Destructive actions elsewhere do confirm |

#### B3. Heuristic review (Nielsen's 10)

| Heuristic | Severity (0–4) | Evidence |
|---|---|---|
| 1 Visibility of system status | 2 | No "Now" indicator on Today. The XP ring's 300 target is hidden |
| 2 Match with the real world | 3 | Card model vs Mexican statements (finding 4). "Treasury", "Agora", "Archive", "Control", "Drachmae", "dr" and the Japanese labels are themed, and the meanings ("Money", "Rewards", "Stats", "Settings") are only in code. Roman-numeral levels (level IV) are slower to read |
| 3 User control and freedom | 2 | Redeeming a reward has no undo. Habits can't be backfilled for yesterday |
| 4 Consistency and standards | 1 | Money shows "$" while copy says MXN. The Agora button says "dr" while the HUD shows a glyph |
| 5 Error prevention | 3 | Overlapping sessions, 1 MXN card "payments", the Rent default, no warning under 15 min |
| 6 Recognition rather than recall | 2 | The plan's rules (never miss twice, the minimum viable version) live in the marquee and the docs, not at the moment of action |
| 7 Flexibility and efficiency | 2 | No quick add, no recent categories, no repeat-last-transaction |
| 8 Aesthetic and minimalist design | 2 | The 130 px header with a moving marquee on every page, and the Cut-Up card on Today, push the work down. The theme is lovely, but on Today it costs space |
| 9 Help users with errors | 1 | Silent failures (an empty amount simply doesn't save) |
| 10 Help and documentation | 2 | No in-app explanation of XP, coins or Perfect Day beyond "all core = perfect day +100 XP" |

#### B4. Measured issues
- **U-1 (rule violation).** At ≥ 768 px, the top nav links are 32 px tall and the Menu button is 38 × 32. The quest row's Complete, "Focus on this" and Edit buttons are 32 × 32, and the "Add" button is 34 px tall. `AGENTS.md` requires tap targets ≥ 40 px. The Lenovo tablet at 800+ CSS px gets the top nav, not the bottom nav.
- **U-2.** The sticky header is 130 px on both widths: 17 % of the laptop's 768 px viewport.
- **U-3.** The marquee animates constantly. Respect `prefers-reduced-motion`, or let the user turn it off.
- **U-4.** No "Now" card (B1).
- **U-5.** Expense category defaults to Rent.
- **U-6.** Reward redeem has no confirm or undo.
- **U-7.** Under 15 min of focus pays 0 XP silently.
- **U-8.** Habits can't be logged for yesterday, which matters for sleep: you know how you slept in the morning, but "Up by 5:45" is ticked for today.

Severity ranking: see the findings table in section 3.

---

### C. Habit science

#### C1. Habits scored against the evidence
Scale: 0 = contradicts the evidence, 1 = partial, 2 = aligned.

| Habit / mechanic | Fogg B=MAP (prompt, ability) | Atomic Habits (obvious, attractive, easy, satisfying) | SDT (autonomy, competence) | Milkman (fresh start, bundling, commitment) | Implementation intention | Score | Note |
|---|---|---|---|---|---|---|---|
| Up by 5:45 | 1 (prompt only via `.ics`) | 1 | 1 | 0 | 1 (time, no place) | 4/10 | Depends on going to bed early. Track "lights out by 22:00" as the lead habit |
| Slept ≥ 7.5 h | 0 (no prompt; logged the next day, but only today is allowed) | 1 | 1 | 0 | 0 | 2/10 | A keystone habit that has repeatedly failed: it needs the smallest version and an evening prompt |
| Exercise | 1 | 1 | 2 | 0 (no temptation bundling) | 1 | 5/10 | Add the minimum viable version ("10 push-ups counts") and the option to bundle a podcast with it |
| Clean 15 min | 1 | 2 | 1 | 0 | 2 (17:30 block) | 6/10 | Fine, but not keystone-level. Make it non-core |
| Intel (newsletters, econ videos) | 2 | 2 | 1 | 0 | 2 | 7/10 as a habit, **0/10 as an incentive** | It already sticks and is enjoyed, so rewarding it adds free XP and risks overjustification. The plan's real goal for intel is a *cap* (45 min) |
| Deep work 8 h | 1 (timer) | 0 (not easy: all or nothing) | 0 (competence frustrated by a target you fail most days) | 0 | 1 | 2/10 | Use a floor plus a target (E-4) |
| Money check-in | 1 | 1 | 1 | 0 | 2 (17:30 block) | 5/10 | Make it concrete: "logged today's spending and looked at the cards" |
| Perfect Day | n/a | 0 (all or nothing) | 0 | 0 | n/a | 0/10 as designed | What-the-hell risk. Needs a Good Day tier and fewer core habits |
| Streak multiplier | n/a | 1 | 1 | 0 | n/a | 2/6 | Barely felt (section A1). Streak shields matter more |
| Agora (coin shop) | n/a | 2 (satisfying) | 1 | 1 (a commitment of sorts) | n/a | 4/6 | Good; tie it to the real fun budget (E-8) |
| Fresh starts | n/a | n/a | n/a | 0 | n/a | 0 | No Monday, month or season reset, no weekly review yet (P1-4) |

#### C2. What the evidence says, and what the app does

| Evidence | What it implies | App today | Proposal |
|---|---|---|---|
| **Fogg, B=MAP / Tiny Habits.** Behavior happens when motivation, ability and a prompt meet. Shrink the behavior until it's easy | A minimum viable version per habit, and prompts at anchor moments | The plan has "minimum viable version" (`00` §3); the app has nothing | E-5: each habit gets a "min" button that counts for the streak with partial XP |
| **Clear, *Atomic Habits*.** Make it obvious, attractive, easy, satisfying. "Never miss twice" | Visible cues, immediate satisfaction, recovery rules | Satisfying: yes (toasts). Obvious: weak (no "Now"). Never miss twice: only in the marquee | E-6 "Now" card; E-5 shields |
| **Lally et al. 2010.** Median 66 days to automaticity (range 18–254). Missing one day didn't hurt; inconsistency did | A 90-day season fits. Reward consistency, forgive single misses | Streaks reset on any miss | E-5: one streak shield per 7-day streak (P4 brought forward); "missed once" is shown neutrally |
| **Polivy and Herman.** The "what-the-hell" effect after a rule is broken | Avoid all-or-nothing daily goals | Perfect Day is all or nothing; the 8 h target is failed most days | E-4: Good Day tier, floor and target |
| **SDT (Ryan and Deci 2000).** Autonomy, competence, relatedness. **Deci, Koestner and Ryan 1999:** expected tangible rewards contingent on doing a task reduce intrinsic motivation (d ≈ −0.28 to −0.40); positive feedback increases it (d ≈ +0.33) | Don't pay coins for things already enjoyed for their own sake (writing, video, reading, intel). Use informational feedback there | Hobby hours and intel earn XP and coins like work | E-7: hobby areas give XP (feedback) but no coins; intel becomes a non-core ritual with a cap |
| **Milkman.** *Fresh start effect* (Dai, Milkman and Riis 2014): goal pursuit rises after temporal landmarks. *Temptation bundling* (Milkman, Minson and Volpp 2014): +51 % gym visits at first, fading over time | Seasons and Monday or first-of-month resets. Pair exercise with a guilty pleasure | Season 1 exists on paper only | E-9: season banner and Monday/month fresh-start prompt; an optional bundle field on a habit |
| **Implementation intentions (Gollwitzer and Sheeran 2006).** d = 0.65 across 94 tests. The 2024 update is smaller for behavior (about d = 0.27) | "When X, I will Y" plans help, modestly | The ideal day has times but no if-then plans | E-5: each habit gets an optional "When…, I will…" line, shown on the Now card |
| **Gamification (Hamari, Koivisto and Sarsa 2014).** 24 studies: mostly positive effects, strongly dependent on context and user | Points and streaks are fine for a user who likes them, but the design must be honest and hard to game | The user likes points, streaks and treats: a good fit | Keep the game layer; fix exploits (E-1 to E-3) |
| **Duolingo (published A/B tests).** Weekend Amulet: +4 % return a week later, −5 % streak loss. Streak Wager: Day-7 retention +14 % | Streak protection and commitment wagers work | None | E-5 shields; E-9 optional weekly wager (stake coins on the weekly scorecard) |
| **Ericsson et al. 1993 / Newport.** About 4 h/day of deliberate, intense concentration is a practical ceiling for experts (a rule of thumb, not a law) | Don't make 8 h of *deep* work the daily pass mark | 8 h × 7 days | E-4: weekday floor 4 h, target 6 h, no XP after 8 h; weekend floor 1.5 h |

**Verdict for C:** the routine design leans on willpower (long, fixed, all-or-nothing targets) at the exact points where the user has a history of failure (sleep, eating, exercise), and pays the most for the habits that already stick (reading, intel). Turn that around: smallest versions and protection for the fragile keystones, informational feedback only for the ones already automatic.

---

### D. Financial soundness

#### D1. The plan against the books

| Source | Core idea | Plan / app today | Gap | Proposal |
|---|---|---|---|---|
| **Robin and Dominguez, *Your Money or Your Life*** | Money is life energy. Compute the *real* hourly wage (net of job costs and including all job-related time) and translate spending into hours | The Wealth Engine computes **gross** MXN per **focus** hour, per area, over 90 days | It overstates the rate: it uses gross income, ignores taxes, tools and commuting, and ignores non-focus time (admin, sales, travel). Teaching income looks very high per hour if class time isn't logged as focus | E-10: a "real MXN/h" column (net of tax reserve and the area's expenses; includes manually logged non-focus hours). Show "this purchase = N hours" on large expenses |
| **Michalowicz, *Profit First*** | Allocate a percentage of each deposit to buckets (profit, owner's pay, tax, operating expenses) first. Percentages are starting points, moved toward targets gradually | The plan's split (50 / 10–15 / 20 / 10 / 5) is Profit First in spirit. The app has no buckets or allocation step | Nothing prompts the split when income arrives. With irregular income, owner's pay should be *smoothed* | E-11: when income is logged, a "split it" sheet proposes the bucket transfers (one tap each). Optional "income holding" account that pays a fixed monthly salary |
| **Sethi, *I Will Teach You to Be Rich*** | Automate. A conscious spending plan: fixed costs 50–60 %, investments about 10 %, savings 5–10 %, guilt-free 20–35 % (all rough guides) | Automation is mentioned (card *domiciliación*). Fun is 5 % | 5 % guilt-free is very tight by Sethi's guide. A too-tight fun budget tends to leak into unplanned spending | Decision for the user: fun 5–10 %. The Agora becomes the gate for spending it (E-8) |
| **Housel, *The Psychology of Money*** | Room for error. Reasonable beats rational. Saving doesn't need a goal | The 6-month shield is in the plan; good | The seeded goals are fixed (25k / 150k) instead of derived from real spending | E-12: shield targets = 1× and 6× the median monthly spending of the last 3 months |
| **Thaler and Benartzi, Save More Tomorrow (2004)** | Pre-commit to save a share of *future* raises. Participants went from 3.5 % to 13.6 % in under 4 years | Fixed 20 % from day one | For someone who isn't saving yet, jumping to 20 % at once is all or nothing again | E-12: start at whatever is sustainable (e.g. 5–10 %), plus an "escalate by 2 points every time monthly income beats the last 3-month median" rule |
| **Snowball vs avalanche** (Gal and McShane 2012: small wins predict paying it all off; Amar et al. 2011: people pay small debts first even when it's costly) | Avalanche is cheaper; snowball is more motivating | The plan says avalanche if there's revolving debt | For a *totalero* there's no revolving debt, so neither applies. The rule that matters is **stay totalero** | Reward the statement payment (E-13). Keep avalanche in the plan for the case where debt becomes revolving |

#### D2. Mexico-specific facts (verified November 2026)

| Fact | Value | What it means for the plan |
|---|---|---|
| **CETES** (3 Nov 2026 auction) | 28 days 6.50 %, 91 days 6.69 %, 175 days 6.72 %, 693 days 7.85 % | A liquid, safe home for the emergency fund, as `00` suggests. Real return ≈ 2.7 % against the 3.69 % December 2025 inflation that set the 2026 UMA. Banxico's target was 6.50 % through September 2026 and was cut to 6.25 % on 5 Nov 2026 (D-7) |
| **Credit card cost** | Banxico's balance-weighted average *interest rate* for cards was 22.82 % (Jan–Feb 2026). CAT (interest + fees + VAT) is widely reported around 50–60 % for people who carry a balance; the CONDUSEF/Banxico comparison spans about 23 %–206 % by product | Confirms `00` Level 1: revolving card debt costs far more than any safe investment pays. Being a *totalero* is worth more than any yield optimization |
| **CONDUSEF guidance** | Pay the *pago para no generar intereses* (prior balance, interest, fees and installments); the minimum only for emergencies; become a *totalero* | The app should model the statement amount, not just the running balance (E-13) |
| **RESICO (personas físicas)** | ISR 1 %–2.5 % of income actually received (LISR art. 113-E); annual cap 3.5 M MXN; no expense deductions; corporate clients withhold 1.25 % | The plan's flat 10–15 % tax reserve is too high for RESICO ISR alone, but it must also cover **IVA collected** if applicable. A contador should set the percentage |
| **PPR / voluntary AFORE deduction** (LISR art. 151 fr. V) | Lesser of 10 % of taxable income or 5 annual UMA (5 × 42,794.64 = **213,973.20 MXN** in 2026). Outside the global 15 % / 5 UMA cap. **Not available under RESICO** | `00` Level 4 suggests both RESICO and deductible PPR/AFORE. They conflict: pick one with the contador |
| **UMA 2026** | Daily 117.31, monthly 3,566.22, annual 42,794.64 MXN (in force from 1 Feb 2026) | Used above |

#### D3. Treasury code check (`src/finance/finance.ts`, `Money.tsx`)

| Function | Verdict | Notes |
|---|---|---|
| `netWorth` | Correct for the tracked accounts | Archived accounts drop out even if they still have a balance (F-5). Investments outside the app aren't counted (by design) |
| `balanceOf` | Correct | Credit balances are negative when in debt |
| `monthTotals` / savings rate | **Formula correct**: (income − expenses) ÷ income, on an accrual basis. Card purchases count when made; card payments are transfers and are excluded, so nothing is counted twice | Edge cases. **F-1:** with zero income it shows "0 %" in red; it should show "—". **F-2:** a "Refund" is income, which inflates both income and savings rate; it should reduce expenses. **F-3:** the expense category list includes "Card payment", so logging a payment as an expense *does* double-count; remove that category or warn |
| `cardStatus` | Correct for a running balance | **F-4:** there's no statement balance. "Debt" includes purchases after the cut-off that aren't due yet, so the Today alert asks for more than the *pago para no generar intereses*. The "paid in full" reward requires a zero running balance (stricter than the statement) yet pays for 1 MXN on an empty card (exploit X-2) |
| `nextDayOfMonth` | Correct (clamps short months) | |
| `hourlyRates` | Arithmetic correct | Gross rate (see YMOYL above). Income timing is lumpy (invoices paid late), so 90 days is a reasonable window |
| `pipelineValue` | Correct | Expected value = Σ monthly value × probability. There are no next-action dates, so no "stale lead" warning (E-14) |
| Master-plan compound table | **Correct** as nominal values (end-of-month contributions at 7 %/yr): 10k → 1.73 M, 25k → 4.33 M (10 y), 7.92 M (15 y), 40k → 6.92 M | **F-6:** label it *nominal*. In today's pesos (7 % nominal, 3.69 % inflation), 10k a month for 10 y ≈ 1.41 M, 25k ≈ 3.53 M, 40k ≈ 5.64 M |
| Seeded goals | Fixed numbers | E-12 (derive them from spending) |

**Verdict for D:** the plan's order of operations (stop the bleeding, then the shield, then the income engine, then compounding) matches the books, and the Mexico-specific advice is directionally right. The weak points:
- **Saving isn't automated or prompted:** nothing happens at the moment income arrives.
- **The card model doesn't match Mexican statements.**
- **The tax advice in `00` mixes RESICO with art. 151 deductions.**
- **Goals are fixed numbers** rather than derived from real spending.

For a user with irregular income who isn't saving yet, the most valuable single change is **E-11 + E-12**: a one-tap "split it" sheet when income lands, and an emergency fund sized from real spending.

---

### E. Redesign proposal

#### E1. Options

| | **Option A: Fix and retune** | **Option B: A + leading indicators (recommended)** | **Option C: B + coins backed by money** |
|---|---|---|---|
| Exploits | All fixed (E-1 to E-3) | Same | Same |
| Deep work | Weekday floor 4 h / target 6 h; weekend floor 1.5 h. Focus XP 20/h up to 6 h, 10/h for 6–8 h, 0 after 8 h | Same | Same |
| Perfect Day | 4 core keystones (sleep, move, deep-work floor, money check-in): +60 | Same, plus a **Good Day** (3 of 4): +25 | Same as B |
| Weekly | none | **Weekly scorecard**: 3 of 4 (focus ≥ 25 h, exercise ≥ 4 days, money check-in ≥ 5 days, ≥ 5 Good/Perfect days) = +150 | Same, plus an optional coin wager |
| Income engine | none | **Leading indicators**: conversation logged +15 (max 3/day), proposal sent +40, case study published +75, opportunity moved forward +10; "First retainer" achievement +500 | Same |
| Coins | Same as now; Agora prices cut about 30 % | Same as A | **1 dr = a fixed MXN value from the fun bucket.** The Agora shows each price in MXN too; redeeming moves money from "Fun" to spending. Coins earned beyond the month's fun budget roll over |
| Hobbies, intel | XP only, no coins (overjustification) | Same | Same |
| Simulated (realistic) | Estimate (not simulated separately): Perfect ≈ 17 %, about 300 dr/week | **Perfect + Good ≈ 58 %, weekly bonus ≈ 38 %, about 370 dr/week** | Same as B, but real spending is capped by income |
| Effort | Small: about 4 small tickets | Medium: about 9 tickets, one schema bump (leads log) | Large: plus a money link, needs E-11 |
| Risk | Little new motivation | More things to log (kept to 1 tap) | Ties fun to income, so a bad month means less fun. Can feel like a job; tune carefully |

**Recommendation: Option B now, and C as a Season 2 experiment** once the bucket split (E-11) has run for a month.
- **Why B:** it fixes the score's honesty, makes the daily goal reachable about 60 % of the time (the PRD metric becomes "Good-or-Perfect-Day rate ≥ 60 %"), and puts about 6 % of XP on the income engine's leading indicators, which the plan calls "the real game".
- **Why not C yet:** it makes sense for a user motivated by treats, but it depends on data (a monthly fun budget) that the app doesn't track yet.

#### E2. Proposed numbers for `src/game/rules.ts` (Option B)

| Constant | Now | Proposed |
|---|---|---|
| `TASK_XP` | 5 / 15 / 35 / 75 / 200 | 5 / 15 / 35 / 75 / 150, with Epic needing a note ("what done looks like") and at most 1 Epic per day at full XP |
| `sessionXp` | 20 XP/h, unlimited | 20 XP/h for 0–6 h of the day, 10 XP/h for 6–8 h, 0 after 8 h; the remainder of a 50-min sprint is rounded fairly (per-minute pro-rata) |
| `WORKDAY_BONUS_XP` | 60 at 8 h | 30 at the full target (6 h weekdays); weekend: floor only |
| Work habit | 8 h, 7 days | Floor 4 h (weekdays) / 1.5 h (weekends) = habit done (+40) |
| `PERFECT_DAY_XP` | 100, 7 core | 60, 4 core |
| `GOOD_DAY_XP` (new) | n/a | 25 for 3 of 4 core |
| `WEEKLY_SCORECARD_XP` (new) | n/a | 150 for 3 of 4 weekly targets |
| `LEAD_XP` (new) | n/a | conversation 15 (cap 45/day), proposal 40, case study 75, stage moved 10 |
| `FINANCE_XP.payCardInFull` | 50 when the running balance is ≥ 0 | 50 once per card per statement, when payments since the cut-off ≥ the statement amount |
| `FINANCE_XP.saveDeposit` | 25 per update | 25 per *transfer* into a savings or investment account of ≥ 1 % of the month's income, max 4 per month |
| Streak multiplier | +5 % per week, max +50 % | Unchanged; add shields (1 per 7-day streak, max 2 held) |
| Agora guidance | 40–60 / 250–300 / 1,000 | Unchanged under B (B earns about 37 % more per realistic week). Under A: 40 / 180–200 / 700 |

#### E3. Goals and plan revisions (for the user to approve in `00`)
1. **PRD success metrics:** replace "Perfect-Day rate ≥ 60 %" with **"Good-or-Perfect-Day rate ≥ 60 %"**, and "Average deep work ≥ 7 h on weekdays" with **"weekday deep-work floor met ≥ 80 % of weekdays; weekly deep work ≥ 25 h"**.
2. **Season 1 boss fight:** keep "first retainer + 1-month fund", and make the third leg "Good-or-Perfect-Day rate ≥ 60 % for 30 days".
3. **Ideal day:** 4 × 2 h blocks stays as the *template*, but the pass mark is the floor and target above. Block 4 (AI) becomes the flexible block.
4. **Routine core:** sleep (lights out by 22:00 as the lead habit), move (minimum: a 10-minute walk or 10 push-ups), deep-work floor, money check-in. Rituals (non-core, XP only): wake by 5:45, clean, intel (with a 45-min cap), eat well (new; minimum: a vegetable at lunch).
5. **Wealth plan:** savings starts at a sustainable % and escalates (SMarT). The shield is sized from real spending. A tax note says "RESICO **or** art. 151 deductions; ask the contador". The compound table is labeled nominal, with a real-terms column.

---

## 3. Ranked findings

Severity: **Critical** = defeats a core goal · **High** = misleads or is a hard-rule violation · **Medium** = friction · **Low** = polish.

| # | Severity | Finding | Evidence | Fix | Effort |
|---|---|---|---|---|---|
| 1 | Critical | Perfect Day unreachable (0–1 % in realistic schedules); PRD metric impossible | A2 simulation; C1 | E-4 | M |
| 2 | Critical | Exploits X-1 (overlapping focus) and X-2 (1 MXN card payment = +50, no cap) | Browser screenshots `*-03b`, `*-05`; A3 | E-1, E-2 | S |
| 3 | High | No reward for the income engine's leading indicators; finance 4 % of XP | A2 XP mix | E-14 | M |
| 4 | High | Card model ignores the statement amount; *totaleros* see "debt" in red; the reward is wrong both ways | D3 F-4; CONDUSEF | E-13 | M (schema) |
| 5 | High | Tap targets 32 px at ≥ 768 px (top nav, quest row buttons) | B4 U-1 | E-15 | S |
| 6 | High | `00` suggests both RESICO and deductible PPR/AFORE, which are incompatible | D2 | Plan edit (user) | S |
| 7 | High | No savings automation or prompt when income arrives; fixed shield targets | D1, D3 | E-11, E-12 | M |
| 8 | Medium | Goal "Update" exploit (X-3) and achievements never revoked (X-6) | A3 | E-2, E-3 | S |
| 9 | Medium | No "Now" card on Today; the 5-second "what now" fails | B1 | E-6 | S |
| 10 | Medium | No minimum viable versions, no streak shields, no if-then plans | C2 | E-5 | M |
| 11 | Medium | Intel and hobby hours rewarded with coins (overjustification; free XP) | C1, C2 | E-7 | S |
| 12 | Medium | Savings rate edge cases (0 income, refunds as income, "Card payment" as an expense category) | D3 F-1 to F-3 | E-16 | S |
| 13 | Medium | Category defaults to Rent; reward redeem has no confirm or undo; no habit backfill for yesterday | B2, B4 | E-17 | S |
| 14 | Low | 50-min sprints pay 18 XP/h, not 20 (floor per 15 min) | A1 | E-1 | S |
| 15 | Low | 130 px header and an always-on marquee; themed labels without plain-language hints | B3, B4 | E-18 | S |
| 16 | Low | Compound table not labeled nominal; archived accounts leave net worth | D3 F-5, F-6 | E-16 | S |

---

## 4. Proposed tickets

Roadmap format. Size: S ≤ 1 h · M 1–3 h · L = split further. **None of these is approved yet.** Tickets that touch `rules.ts`, the schema or `00` need the user's explicit OK under `AGENTS.md`.

### Phase E: Evaluation follow-ups

| ID | Ticket | AC |
|---|---|---|
| E-1 S | **Focus integrity** | `logSession` rejects or trims a session that overlaps an existing one; the manual entry form shows an error. Timer auto-stops at 12 h and asks "Still working?" when opened after > 3 h. Session XP is pro-rata per minute. Tests for overlap and the cap |
| E-2 S | **Finance reward integrity** | Card reward moves into `engine.ts`: pays only when the card had debt before the payment, once per card per cut-off cycle. Goal progress only via a transfer into a savings or investment account (≥ 1 % of the month's income, max 4/month), with a deterministic refId `goal:<id>:<yyyy-mm>:<n>`, revoked when the transfer is deleted. Tests |
| E-3 S | **Quest and achievement honesty** | At most 1 Epic per day at full XP (later ones pay Hard). Epic requires a "done means…" note. Achievements are re-checked on revoke and re-locked (their XP revoked) when the condition becomes false. Tests |
| E-4 M | **Floor and target deep work, 4 keystones, Good Day** (needs OK: XP economy) | `rules.ts`: floor/target per weekday/weekend from settings, the session taper, Good Day XP, Perfect Day with 4 core habits. Migration (version n+1) re-flags the core habits and sets defaults. `04-GAME-DESIGN.md` and `01-PRD.md` metrics updated. `scripts/eval-sim.ts` reproduces the v2 table |
| E-5 M | **Minimum versions, streak shields, if-then plans** (needs OK: schema) | Habit gets `minLabel`, `minXpPct` (default 50 %), `plan` ("When…, I will…"). Today shows a "min" button. Shield: earned every 7-day streak, max 2, auto-used on a missed day, logged in the ledger with 0 XP. Tests |
| E-6 S | **"Now" card on Today** | Above the rings: the current Ideal Day block, the top quest for that block's area, and one primary button (Start focus / Check habit / Log money). Fits in the first viewport at 820 × 1180 and 1366 × 768 |
| E-7 S | **Intrinsic areas: feedback, not pay** | Areas with `kind: 'hobby'` give XP but 0 coins; intel becomes a non-core ritual with a 45-min cap shown as a timer. Copy explains why |
| E-8 L | **Coins backed by the fun bucket** (Option C, Season 2; needs OK) | Setting: MXN per dr. The Agora shows MXN beside dr. Redeeming offers to log a "Fun" expense. Monthly fun budget = fun % × the month's income; the Agora warns when it's exceeded. Split it into ≥ 3 tickets before starting |
| E-9 M | **Fresh starts and the weekly scorecard** | Monday and first-of-month banner ("new week: what's the plan?"). The weekly scorecard (4 targets, 3 of 4 = +150) appears in the weekly review (P1-4). Optional coin wager on the scorecard |
| E-10 S | **Real MXN/h** | The Wealth Engine adds "net" (after tax reserve % and the area's expenses) and lets the user add non-focus hours for an area. Tests in `finance.ts` |
| E-11 M | **"Split it" on income** | Logging income opens a sheet that proposes transfers to the bucket accounts by the plan's percentages (editable in Settings); one tap each; skippable. Optional "income holding" account with a fixed monthly salary transfer |
| E-12 S | **Shield sized from real spending, SMarT escalation** | Shield goals = 1× / 6× the 3-month median monthly expenses (when ≥ 1 month of data). Savings % setting with an "escalate +2 points when income beats the 3-month median" suggestion |
| E-13 M | **Statement-based cards** (needs OK: schema) | Account gets the last statement balance, statement date, and amount due to avoid interest (entered from the paper or app statement, or computed as the balance at the cut-off). Today's alert shows that amount. "Card debt" splits into "statement due" and "new since cut-off". Reward per E-2. Tests |
| E-14 M | **Leading indicators** (needs OK: XP economy) | "Log a conversation / proposal / case study" quick actions in the Opportunity Pipeline, with XP per E2 and daily caps. A stale-lead warning when the next action is more than 7 days old. Achievement "Rainmaker" (first retainer) |
| E-15 S | **Tap targets ≥ 40 px** | Top nav links and the Menu button ≥ 40 px tall; quest row buttons 40 × 40; "Add" buttons ≥ 40 px. A Playwright check measures them at 820 and 1366 px |
| E-16 S | **Treasury math edge cases** | Savings rate shows "—" with zero income. Refunds reduce expenses instead of counting as income. "Card payment" removed from expense categories (or a warning). Archived accounts with a balance ≠ 0 still count, with a hint. `00` compound table labeled nominal, with a real column. Tests |
| E-17 S | **Small friction fixes** | Expense category remembers the last one used (default "Food"). Redeem asks for confirmation, with a 10 s undo toast. Habits can be logged for yesterday (sleep defaults to last night). Warn when stopping focus under 15 min |
| E-18 S | **Calmer chrome** | Marquee respects `prefers-reduced-motion` and can be turned off. Header ≤ 96 px on the laptop. Plain-language subtitle under themed names ("Treasury · money", "Agora · rewards") |

---

## 5. Sources

**Behavior and gamification**
- Hamari, Koivisto and Sarsa (2014), [Does Gamification Work? A Literature Review of Empirical Studies on Gamification](https://www.lescahiersdelinnovation.com/wp-content/uploads/2019/06/2014-hamari_et_al-does_gamification_work.pdf), HICSS. [Aalto record](https://research.aalto.fi/fi/publications/does-gamification-work-a-literature-review-of-empirical-studies-o/)
- Lally et al. (2010), How are habits formed: modelling habit formation in the real world: [UCL summary](https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit), [critique of the 66-day figure](https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit)
- Gollwitzer and Sheeran (2006), implementation intentions meta-analysis: [summary and 2024 update](https://www.thebehavioralscientist.com/glossary/implementation-intentions), [Frontiers review](https://www.frontiersin.org/articles/10.3389/fnhum.2015.00395/full)
- Deci, Koestner and Ryan (1999), [A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf), *Psychological Bulletin* 125(6)
- Ryan and Deci (2000), [Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being](https://bibbase.org/network/publication/ryan-deci-selfdeterminationtheoryandthefacilitationofintrinsicmotivationsocialdevelopmentandwellbeing-2000), *American Psychologist* 55(1)
- Dai, Milkman and Riis (2014), [The Fresh Start Effect](https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf), *Management Science* 60(10)
- Milkman, Minson and Volpp (2014), [Holding the Hunger Games Hostage at the Gym: An Evaluation of Temptation Bundling](https://repository.upenn.edu/oid_papers/150), *Management Science* 60(2)
- Fogg, [Fogg Behavior Model (B=MAP)](https://behaviormodel.org/)
- Polivy and Herman, the "what-the-hell" effect: [overview](https://www.spring.org.uk/?p=13881), [Polivy bio](https://www.psych.ualberta.ca/GCPWS/Polivy/Biography/Polivy_bio4.html)
- Duolingo, [How streaks keep Duolingo learners committed](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals) (Weekend Amulet and Streak Wager A/B results)
- Ericsson, Krampe and Tesch-Römer (1993) and Newport on the about-4-hour ceiling: [John D. Cook, Four hours of concentration](https://www.johndcook.com/blog/2013/02/04/four-hours-of-concentration/), [LessWrong discussion of the evidence](https://lesswrong.com/posts/pWiAuhBmWskgESM4R/how-long-can-people-be-productive-in-time-period)

**Personal finance**
- Robin and Dominguez, *Your Money or Your Life*: [summary of the nine steps and real hourly wage](https://www.shortform.com/blog/?p=39944)
- Michalowicz, *Profit First*: [Mastering Profit First: percentage allocations](https://mikemichalowicz.com/mastering-profit-first-master-your-percentage-allocations/)
- Sethi, conscious spending plan: [I Will Teach You to Be Rich](https://www.iwillteachyoutoberich.com/how-to-calculate-expenses), [Motley Fool summary](https://fool.com/the-ascent/personal-finance/articles/ramit-sethi-says-you-can-spend-this-surprising-amount-of-money-guilt-free/)
- Housel, *The Psychology of Money*: [book notes](https://www.grahammann.net/book-notes/the-psychology-of-money-morgan-housel)
- Thaler and Benartzi (2004), [Save More Tomorrow](https://www.chicagobooth.edu/research/rustandy/social-impact-research/research-papers/2004/save-more-tomorrow-using-behavioral-economics-to-increase-employee-saving), *Journal of Political Economy* 112(S1)
- Gal and McShane (2012), [Can Fighting Small Battles Help Win the War?](https://insight.kellogg.northwestern.edu/article/to_beat_debt_consider_starting_small), *JMR* 49
- Amar, Ariely, Ayal, Cryder and Rick (2011), [Winning the Battle but Losing the War: The Psychology of Debt Management](https://source.washu.edu/2011/07/to-reduce-debt-focus-on-high-interest-loans-first/), *JMR* 48

**Mexico (checked November 2026)**
- CETES auction of 3 Nov 2026: [Imagen Radio](https://www.imagenradio.com.mx/finanzas/cetes-quedaron-tasas-semana-3-10-noviembre-2026); Banxico [SIE interest rates](https://www.banxico.org.mx/tipcamb/llenarTasasInteresAction.do?idioma=sp); target-rate context: [México Cómo Vamos, Sep 2026](https://mexicocomovamos.mx/wp-content/uploads/2026/10/InfografiaMCV_PolMon_Sep2026.pdf), [Bloomberg Línea](https://www.bloomberglinea.com/latinoamerica/mexico/banxico-mantiene-tasa-de-interes-en-650-mientras-inflacion-converge-cerca-del-objetivo/)
- Credit cards: Banxico [series CF840, balance-weighted effective card rate](https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=18&accion=consultarCuadro&idCuadro=CF840&locale=es), [Indicadores Básicos de Tarjetas de Crédito](https://www.banxico.org.mx/publicaciones-y-prensa/rib-tarjetas-de-credito/%7BEDFAC909-76C7-749D-778B-859D724250E2%7D.pdf); CAT ranges: [Líder Empresarial (CONDUSEF/Banxico comparison)](https://www.liderempresarial.com/mejores-peores-tarjeta-credito-segun-cat/), [N+](https://www.nmas.com.mx/economia/finanzas-personales/recorte-banxico-tasa-pagaras-menos-intereses-tarjeta-credito-2026-mexico/)
- CONDUSEF guidance: [CONDUSEF article published by Banorte, "Tu tarjeta de crédito: ¿aliada o pesadilla?"](https://www.banorte.com/cms/CONDUSEF/2023/octubre/Art-Tu-tarjeta-de-credito-Aliada-o-Pesadilla.pdf), [El Imparcial (2026): pago mínimo vs pago para no generar intereses](https://www.elimparcial.com/mexico/2026/02/07/pago-minimo-o-pago-para-no-generar-intereses-la-decision-que-puede-cambiar-tu-deuda-con-la-tarjeta/), [N+: qué es el pago para no generar intereses](https://www.nmas.com.mx/economia/tarjeta-de-credito-que-es-el-pago-para-no-generar-intereses/)
- RESICO 2026: [Praxium: tarifa art. 113-E](https://praxiumconsultores.com/blog/tarifa-resico-personas-fisicas-2026), [Alegra](https://blog.alegra.com/mexico/resico-personas-fisicas/), [Carbajal Contadores](https://carbajalcontadores.com/2026/07/28/resico-personas-fisicas-2026-tasas-isr-requisitos-obligaciones/)
- PPR / AFORE deduction (LISR art. 151 fr. V): [Rankia](https://www.rankia.mx/blog/mejores-afores/7448278-deducir-ppr-declaracion-anual), [Praxium: tope global](https://praxiumconsultores.com/blog/tope-global-de-deducciones-personales-5-uma-o-15), [El Contribuyente](https://www.elcontribuyente.mx/2026/04/como-deducir-tu-ahorro-para-el-retiro-ante-el-sat/)
- UMA 2026: [IDC Online](https://idconline.mx/laboral/2026/01/09/valor-uma-2026-inegi-publica-nuevos-montos), [Bloomberg Línea](https://www.bloomberglinea.com/latinoamerica/mexico/cuanto-vale-la-uma-en-2026-asi-quedo-definida-en-mexico/)

*Several Mexican sources are news outlets or accounting firms, not the DOF or SAT. Confirm any tax decision with a licensed contador. This report is not financial or tax advice.*
