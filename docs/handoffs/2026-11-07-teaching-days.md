# Handoff: teaching days (approved spec) + what's next

*Written 2026-11-07 by the agent that built Season 1 essentials (PR #2, merged) and the automatic floor. For the next coding agent.*

## Start here
1. Read `AGENTS.md` (hard rules override everything), then `docs/09-EVALUATION.md` (section 0 and "Season 1 essentials"), `00-MASTER-PLAN.md`, `04-GAME-DESIGN.md`, `03-DATA-MODEL.md`, `08-DESIGN-SYSTEM.md`.
2. Work on `claude/sharp-knuth-gvnvmc`. It's `main` + one unmerged commit (`455305a`, the automatic floor). Keep it; your commit goes on top. The PR for both comes after, **with the user's OK**.
3. Summarize your plan in a few lines and wait for the user's OK before coding. The spec below is approved, so the plan should be short and only flag anything you'd do differently.

## State of the app
- Dexie **v11**; backups `BACKUP_VERSION` 5. 123 tests. The build runs a bundle budget (`scripts/check-bundle.mjs`): entry < 300 kB, startup JS < 350 kB (now ~330).
- The user's rule for planning: **every number comes from their real data**, never a hard-coded guess. When data is missing, show a placeholder and say what unlocks the real number.
- Personal figures (schedule, salary, spending) stay **on the device** (settings and tables), never in the repo. Defaults in code must be neutral.

## The ticket: teaching days (approved by the user, 2026-11-07)
On teaching days the user prepares classes in the morning, leaves home for CIDE, teaches, and comes back in the evening. Today the app treats those days as normal weekdays: a 6 h/8 h deep-work target that's impossible, and a "Now" card that suggests deep work while they're on the road.

### Approved decisions
| # | Decision |
|---|---|
| T-1 | **Teaching schedule in Control** (stored as a setting on the device, empty by default): teaching weekdays, leave-home time, class start and end, home-by time, semester start and end dates, and the area (CIDE). The user will enter: Mon + Wed, leave 14:30, class 16:10–17:40, home ~19:30 |
| T-2 | **Teaching-day Ideal Day**, generated from the schedule. Blocks before 08:00 are unchanged. Then: 08:00–10:00 deep work 1 (class prep), 10:15–12:15 deep work 2 (prep and grading), 12:15–13:15 lunch, 13:15 until 15 min before leaving deep work 3 (final prep), 15 min money check-in and pack, travel to CIDE, prepare the classroom (arrival to class start), class, travel home, a 15-min shutdown (pick tomorrow's 3 quests) on arrival, then the normal dinner, wind-down and bed blocks. Times come from the schedule, not constants |
| T-3 | **Deep-work targets on teaching days: 4 h done, 5 h full** (weekdays stay 6/8, weekends 4/6). 5 h is the focus window before leaving; done stays ~75 % of full like weekdays. Focus XP stops at 5 h on those days. The weekly scorecard stays at 30 h |
| T-4 | **The class is not focus time.** Prep and grading are (logged as Focus on CIDE). The class pays in the real MXN/h, not in focus XP |
| T-5 | **CIDE non-focus hours come from the schedule automatically**: each teaching day inside the semester counts (home-by − leave) hours, i.e. 5 h a day, 10 h a week, for the real MXN/h, the floor's paid hours and the weekly review's hours per area. The user then doesn't need a manual weekly entry |

### Implementation notes (suggestions; the code is the source of truth)
- **Targets.** `src/game/rules.ts` is pure. Add `teaching: { done: 4, full: 5 }` to `WorkTargets` / `DEFAULT_WORK_TARGETS`, and make the day's targets depend on the schedule. For example, `targetsFor(key, targets, schedule?)` with a pure `isTeachingDay(key, schedule)` that checks the weekday and the semester range. Callers: `evaluateDay` in `engine.ts` (via `getWorkTargets`), `useWorkTargets` in `src/lib/hooks.ts`, Today. Settings → deep-work targets should show and edit the teaching pair too.
- **Schema.** The schedule is a new settings key, and `workTargets` gains `teaching`. The user wants any stored-shape change to get a Dexie version with an `upgrade()`, so add **v12**: fill `workTargets.teaching` when missing. Extend `tests/migration.test.ts` (v2 → v12, existing data survives). Include the schedule in backups (settings already are) and bump `BACKUP_VERSION` only if a table changes.
- **Ideal Day.** `src/lib/routine.ts` has a fixed `IDEAL_DAY` and `currentBlockIndex(now)`. Make the blocks for a date come from a pure function such as `idealDayFor(date, schedule)`, and use it in Today's Now card (`NowCard`, `BLOCK_AREA_ICON`: the owl icon means CIDE), the Ideal Day card and the shutdown text. New blocks use existing glyphs (owl, path, lamp, wave, cup). The `.ics` export should give teaching days their own events (`RRULE` with `BYDAY`).
- **Real MXN/h.** In `src/finance/finance.ts`, add a pure helper that turns the schedule into virtual weekly `AreaHours` entries (not stored; `weekly`, `hours = (home − leave) × days per week`, `date = semester start`, `until = semester end`). Feed them into `useRealRates` in `src/components/RealRate.tsx` (both the window and the floor's paid hours) and into the Review page's extra hours. If the user also has a manual weekly CIDE entry overlapping the semester, show a one-line hint about double counting rather than silently summing.
- **The "Now" card on teaching days:** travel blocks show "On the way to CIDE" and need no action. The class block shows the class. The prep blocks start focus on CIDE with the top CIDE quest.
- **Tests:**
  - a Monday inside the semester uses 4/5;
  - a Monday outside it, and a Tuesday, use 6/8;
  - focus XP stops at 5 h on a teaching day;
  - the generated Ideal Day has the right blocks for the user's times;
  - the schedule's CIDE hours are 10 h a week and stop at the semester end;
  - the v12 migration.
- **Simulation:** rerun `npx vite-node scripts/eval-sim.ts` with teaching days at 4/5 and report the new Good-or-Perfect rate for the "Realistic (2 teaching days)" scenario in `09-EVALUATION.md`.

### Definition of done (the user's)
- `npm run typecheck && npm test && npm run build` pass.
- Playwright at **820 px (touch)** and **1366 px**, no console errors, tap targets ≥ 40 px.
  - Fix the clock to a Monday ~15:00 (Now = travel) and ~08:30 (Now = prep), and to a Tuesday (normal day).
  - Set the schedule through Control.
- Docs:
  - `03-DATA-MODEL.md` (v12, settings);
  - `04-GAME-DESIGN.md` (targets table);
  - `08-DESIGN-SYSTEM.md` if UI rules change;
  - `09-EVALUATION.md` status;
  - a short teaching-day variant of the Ideal Day in `00-MASTER-PLAN.md` (approved 2026-11-07).
- No emoji, no new dependencies without a one-line reason. One commit for the ticket. Push, then **ask before opening and merging the PR** (it also carries `455305a`).

## After this ticket: candidates (ask the user to choose)
1. **P2 Sync (tablet ↔ laptop).** Each device keeps its own data today, so reviews, hours and money logged on one aren't on the other. This is the biggest real gap. 🔴: plan first (Supabase, RLS, `updatedAt`/`deletedAt`, ledger union); see `docs/prompts/P2-sync.md` and `02-ARCHITECTURE.md`.
2. **P1-3 Habit editor** (add, edit, archive and reorder habits; core flag).
3. **E-9 Fresh starts:** a Monday and first-of-month banner that links the weekly review and the month's plan.
4. **P1-5 Level-up celebration** and **P1-6 sound and haptics** (small, joy).
5. **P1-7 Spanish UI**, if the user wants it.
