# Phase 1 prompts — Polish & personal fit

> Use one chat per ticket. Always: Plan → Implement → Review (see docs/06-AGENT-MANUAL.md §3).

## P1-1 Recurring quests
```
Ticket P1-1 from @docs/05-ROADMAP.md: recurring quests.
Context: @AGENTS.md @src/db/types.ts @src/db/db.ts @src/game/engine.ts @src/components/TaskBits.tsx
Add `recurrence?: { every: 'day'|'week'|'month'; interval: number }` to Task.
Dexie version(2) migration (no index change needed unless you justify it).
When a recurring task is completed, create the next instance with the next dueDate
(pure function `nextDueDate(due, recurrence)` in src/game/rules.ts or a new src/lib/recurrence.ts, unit-tested,
handle month-end clamping). Reopening the completed instance must NOT create duplicates.
UI: recurrence select in TaskForm; a 🔁 chip on TaskRow. Plan first.
```

## P1-3 Habit editor
```
Ticket P1-3: habit editor in Settings. Context: @src/pages/Settings.tsx @src/db/types.ts @src/game/engine.ts
Allow add/edit (name, emoji, kind check|number, target, unit, xp, core) / archive / reorder (up/down buttons).
'auto' habits (work) are editable for target/xp only. Archived habits disappear from Today but keep logs.
evaluateDay must ignore archived habits (it already filters — verify with a test).
```

## P1-4 Weekly review screen
```
Ticket P1-4: Weekly Review at route /review (add to nav as "Review" with lucide CalendarCheck icon,
on mobile replace Stats in bottom bar if space is tight — propose).
Data: last 7 days perfect-day rate, focus hours per area vs weeklyHoursTarget, income/expense,
best streaks, XP. Inputs: 3 wins, 1 lesson, next week's top 3 (creates priority-2 quests).
Persist in a new `reviews` table (Dexie version bump). Award +50 XP once per ISO week (refId `review:<yyyy-Www>`).
```

## P1-5 + P1-6 Level-up celebration, sound & haptics
```
Tickets P1-5 and P1-6. Detect level increase in usePlayer consumers (store lastSeenLevel in settings).
Show a full-screen celebration modal with the new title (CSS-only confetti, respects prefers-reduced-motion).
Add src/lib/sfx.ts using WebAudio (no audio files) with 3 sounds: complete, coin, levelup.
Setting toggles: sound on/off, haptics on/off (navigator.vibrate when available).
```

## P1-7 Spanish / English
```
Ticket P1-7. Create src/lib/i18n.ts with `es` and `en` dictionaries and a `useT()` hook reading
settings.language (default 'es'). Migrate every user-facing string in src/pages and src/components.
Dates via toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US'). Seed names stay as stored data.
Do it page by page; run typecheck after each page.
```

## P1-8 Daily quests
```
Ticket P1-8. Pure function suggestDailyQuests(state) in src/game/daily.ts returning 3 suggestions:
1 money (highest MXN/h monetizable area from finance.hourlyRates, or 'Contact 1 lead' if pipeline is thin),
1 routine-at-risk (habit with longest streak not yet done today), 1 growth (AI area).
Show on Today as dismissible cards with "Accept" (creates priority-1 quest). Unit tests.
```

## P1-9 Code-splitting & P1-10 achievements
```
P1-9: lazy-load each page with React.lazy + Suspense (skeleton fallback). Main chunk < 300 kB; report sizes.
P1-10: add the achievements listed under "To add" in @docs/04-GAME-DESIGN.md to src/game/achievements.ts
with tests for each condition using fake-indexeddb.
```
