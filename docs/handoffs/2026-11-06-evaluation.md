# Handoff: deep evaluation of the game, habits and money design

*Written 2026-11-06 by the agent that finished the quick fixes (items 1–7) and the Vercel deploy. For the next agent.*

## Goal
Answer the user's four questions with evidence, and write the result to `docs/09-EVALUATION.md`:
1. **Game logic:** is the whole game (XP, coins, levels, habits, Perfect Day, achievements, Agora) sufficient for the goals in `00-MASTER-PLAN.md`?
2. **Understandability:** can the user tell in 5 seconds what to do now and how they're doing?
3. **Behavior + money science:** is the design built to create habits and financial solvency, and does it follow the strongest books and research?
4. **Incentives and goals:** are the incentives good enough? Propose a better economy and, if needed, better goals or a revised plan.

**This is an evaluation, not a refactor.** Do not change `src/`, the XP economy (`src/game/rules.ts`), the schema or `00-MASTER-PLAN.md`. AGENTS.md requires the user's OK for those. Proposals go in the report as options and tickets.

## Start here
1. Read `AGENTS.md` (hard rules), then `docs/00-MASTER-PLAN.md`, `01-PRD.md`, `04-GAME-DESIGN.md`, `05-ROADMAP.md`, `08-DESIGN-SYSTEM.md`.
2. Read the game code: `src/game/rules.ts`, `src/game/engine.ts`, `src/game/achievements.ts`, `src/db/seed.ts`, `src/finance/finance.ts`, and the pages in `src/pages/`.
3. **Send the user a plan of a few lines first and wait for their OK** (their standing preference). Ask the intake questions below if they haven't answered them yet.

## Context you won't find in the code
- Live app: https://life-and-how-to-live-it.vercel.app (Vercel, production branch `main`). Tablet: Lenovo Android, installed via Chrome → Install app. Laptop: Chrome.
- Each device has its own local data until Phase 2 sync. No push reminders until Phase 4 (the `.ics` export is the way for now).
- Baseline: typecheck passes, 30 tests pass, build OK with the known "chunk > 500 kB" warning (P1-9).
- Browser checks: `npm run build`, then `npx vite preview --port 4173 --strictPort` in the background, then Playwright (preinstalled, `require('playwright')`, `chromium.launch()`). Use `hasTouch: true` and `.tap()` at 820 px. The IndexedDB name is `life-and-how-to-live-it`.

## Hypotheses to confirm or reject (from a first read; not conclusions)
1. **Perfect Day is nearly unreachable.** It needs all 7 core habits, including **8 h of deep work, 7 days a week**. Deep-work literature (Newport, Ericsson) puts the sustainable ceiling around 4 h/day. All-or-nothing targets invite the "what-the-hell" effect. The PRD metric "Perfect-Day rate ≥ 60 %" may be unreachable as designed.
2. **XP rewards hours, not the income engine.** About 60 % of a perfect day's XP is focus time and its bonuses. The plan says income is the biggest lever, yet nothing rewards its leading indicators (conversations, packaged offers, case studies, pipeline value). Finance XP is small (2 XP per log, capped at 20/day; +50 for paying a card in full; +25 per goal deposit).
3. **Gameable.** Quest difficulty (5–200 XP) is self-assigned. Focus time can be entered manually. Habits are self-reported. Goal deposits pay +25 per deposit, whatever the size.
4. **Coins aren't tied to real money.** The plan's 5 % "fun" bucket and the Agora's coin prices are not connected. Check the overjustification risk (Deci and Ryan) for intrinsically enjoyed areas like writing and video.
5. **Some habits reward the wrong thing.** "Intel" rewards consumption. The plan's "minimum viable version" rule has no in-app equivalent.
6. **Theme vs clarity.** Agora, Archive, Drachmae, the Greek and Japanese labels, and Roman-numeral levels may hurt the 5-second test on Today.

## Method (one section of the report each)
- **A. Game logic.** Map every XP source, sink, cap and revoke path. Write a throwaway simulation (in the scratchpad or `scripts/`, not in `src/`) that imports the pure functions from `src/game/rules.ts` and simulates 90 days for five day types: ideal, realistic, teaching day, weekend, bad week. Report XP and coin flow, the leveling pace vs the table in `04`, the real Perfect-Day rate, coin accumulation vs the Agora price guidelines, and every exploit.
- **B. Understandability.** Run the app at 820 px and 1366 px. Do a heuristic review (Nielsen's 10), a cognitive walkthrough of 6 tasks (first run, log a peso, check a habit, a focus block, a card payment, buying a reward) and a 5-second test of Today. Save annotated screenshots to `docs/eval/` and rank issues by severity.
- **C. Habit science.** Score each habit and mechanic against Fogg's Behavior Model / Tiny Habits, Clear's *Atomic Habits*, Self-Determination Theory, Milkman's *How to Change* (fresh start, temptation bundling, commitment devices), implementation intentions (Gollwitzer), the gamification meta-review (Hamari et al. 2014), and Duolingo's published streak findings (streak freezes).
- **D. Financial soundness.** Check the plan and the Treasury math against *Your Money or Your Life* (life energy = the MXN/h table), *Profit First* (bucket accounts for freelancers), Sethi (automation, conscious spending), Housel, Save More Tomorrow (Thaler and Benartzi), and the snowball vs avalanche research. **Verify Mexico-specific facts with web searches and cite them:** typical credit-card CAT, current CETES rates, RESICO thresholds for 2026, AFORE/PPR deduction caps, CONDUSEF guidance. Check that the savings rate and net worth calculations in `src/finance/finance.ts` are correct.
- **E. Redesign proposal.** Propose a v2 economy (numbers for `rules.ts`, achievements, Perfect Day definition, weekday vs weekend targets, leading-indicator rewards, the coin to real-money link) and any goal or plan revisions. Give 2–3 options with trade-offs, then a recommendation, then ticket-sized changes in the roadmap format (ID, size, AC). Nothing is implemented until the user approves.

## Report format (`docs/09-EVALUATION.md`)
1. Summary: a scorecard with one 1–5 grade per question and the 5 most important findings.
2. Sections A–E, each with its evidence: simulation tables, screenshots, citations.
3. The ranked findings table: severity, evidence, fix, effort.
4. Proposed tickets.
5. Sources, as markdown links. No emoji (house rule).

## Intake questions for the user (all optional; ranges are fine; never commit personal numbers)
1. Typical monthly income now (range), and how much it varies.
2. Card debt now: none, some or a lot? Do you pay in full today?
3. Monthly spending, and any savings or emergency fund already in place.
4. Which habits already stick, and which have failed before?
5. What has motivated you in the past: points and streaks, real treats, progress charts, or other people?
6. Realistic deep-work hours on a good weekday. Should weekends count?

## Done when
- `docs/09-EVALUATION.md` exists with all sections, and screenshots are in `docs/eval/`.
- `npm run typecheck && npm test && npm run build` still pass (nothing in `src/` should have changed).
- One commit, `Eval: deep evaluation`, is pushed to the agent's branch. No PR unless the user asks.
- The user gets a short summary in chat, plus the top decisions they need to make.
