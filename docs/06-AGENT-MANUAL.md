# 06 · Agent Manual — Building Ascenso with Cursor

This is your operating manual for driving an LLM coding agent (Cursor Agent, or Claude Code) to finish and extend this app **without breaking it**.

---

## 1. One-time setup (15 minutes)

1. Install **Node.js 20+** and **Git**, and install **Cursor** (cursor.com).
2. Unzip `ascenso.zip` → open the folder in Cursor (`File → Open Folder`).
3. In Cursor's terminal:
   ```bash
   git init && git add -A && git commit -m "MVP v0.1"
   npm install
   npm run dev
   ```
   Open http://localhost:5173. To test on your tablet over Wi-Fi, use the "Network:" URL Vite prints.
4. Create a **private GitHub repo** and push (Cursor → Source Control → Publish). That's also your backup.
5. Cursor settings:
   - **Rules:** this repo already includes `AGENTS.md` and `.cursor/rules/*.mdc`. Cursor loads them automatically. Check under *Cursor Settings → Rules*.
   - **Model:** use the strongest coding model available for 🔴 tickets and planning. A faster one is fine for 🟢 tickets.
   - **Agent mode** for implementation, **Ask/Plan mode** for planning.
   - Enable "auto-run" only for safe commands (`npm run *`, `git status/diff`).

## 2. The loop (use it for every ticket)

```
┌─ 1. PICK      one ticket from docs/05-ROADMAP.md (top of current phase)
├─ 2. BRANCH    git checkout -b p1-1-recurring-quests
├─ 3. PLAN      paste the ticket prompt (docs/prompts/) in Plan/Ask mode → review the plan
├─ 4. BUILD     switch to Agent mode: "Implement the plan."
├─ 5. VERIFY    agent runs: npm run typecheck && npm test && npm run build
├─ 6. TRY IT    you click through it on laptop width AND tablet (or devtools 820px)
├─ 7. REVIEW    paste the Review prompt (below) → fix findings
├─ 8. COMMIT    git add -A && git commit -m "P1-1: recurring quests"  → merge to main
└─ 9. DEPLOY    push → Vercel auto-deploys → tablet updates itself (PWA autoUpdate)
```

**Golden rules for working with the agent**
- **One ticket per chat.** Start a new chat for each ticket. Long chats degrade quality.
- **Always ask for a plan first** on 🟡/🔴 tickets, and read it. Catching a wrong plan costs 1 minute; catching a wrong implementation costs an hour.
- **Reference files with `@`** (e.g. `@src/game/engine.ts @docs/03-DATA-MODEL.md`) instead of describing them.
- **Make it prove it works:** "Run typecheck, tests and build, and show me the output."
- **Commit before every agent run.** If it goes sideways: `git restore . && git clean -fd`, then retry with a better prompt.
- **If the agent loops on an error for more than 2 attempts**, stop it. Paste the exact error, and ask it to explain the root cause before changing code.
- **Never let it "simplify" invariants** (ledger, migrations, dates). The rules files guard this, but watch diffs to `db.ts`, `engine.ts`, `rules.ts`.
- **Back up your real data before testing migrations:** Settings → Export backup.

## 3. Prompt templates

### 3.1 Kickoff (first chat ever)
```
Read @AGENTS.md and every file in @docs. Then read the src/ tree.
Summarize back to me in 15 bullet points: the architecture, the invariants,
the data model, and how XP is awarded and revoked. Do not write code.
List anything that looks inconsistent between docs and code.
```

### 3.2 Plan a ticket
```
Ticket: <paste the row from docs/05-ROADMAP.md>
Context: @AGENTS.md @docs/02-ARCHITECTURE.md @docs/03-DATA-MODEL.md <+ relevant src files>

Produce an implementation plan only (no code yet):
1. Files to create/modify, with what changes in each.
2. Schema changes + Dexie migration (new version number) if any.
3. New/changed pure functions and the unit tests you'll write.
4. UI changes for tablet (820px) and laptop (1366px).
5. Risks and how you'll avoid breaking existing data.
Keep it minimal: no extra features beyond the AC.
```

### 3.3 Implement
```
Implement the plan. Follow @AGENTS.md hard rules.
When done, run: npm run typecheck && npm test && npm run build
and paste the results. Then list exactly what I should click to verify it manually.
```

### 3.4 Review (paste after implementation)
```
Review your diff (git diff main) as a strict senior reviewer:
- Any write to XP/coins outside award/revoke/redeem? Any award without a deterministic refId?
- Any edit to an existing Dexie version block? Is the migration safe on existing data?
- Any date computed with toISOString/UTC?
- Any money sign errors (credit cards, transfers)?
- Any secret or API key in frontend code?
- Tap targets ≥ 40px, layout OK at 820px and 1366px, empty states present?
- Tests cover the new pure logic?
- Docs updated (data model / roadmap status)?
Fix every issue you find, then re-run typecheck/tests/build.
```

### 3.5 Bug fix
```
Bug: <what I did> → <what happened> → <what I expected>.
Console/error output: <paste>
First explain the root cause with file:line references. Then propose the smallest fix
and a regression test. Wait for my OK before editing.
```

### 3.6 UI polish
```
Improve the visual design of @src/pages/<Page>.tsx to feel like a premium game HUD
while keeping the existing design tokens in tailwind.config.js and primitives in
src/components/ui.tsx. Constraints: no new dependencies, tap targets ≥ 40px,
works at 820px and 1366px, respects prefers-reduced-motion. Show before/after reasoning.
```

### 3.7 Tune the game economy
```
I want <behavior change, e.g. "exercise to feel more rewarding than cleaning">.
Only modify src/game/rules.ts or seeded habit XP values. Update docs/04-GAME-DESIGN.md
tables accordingly and adjust tests. Explain the effect on a "perfect weekday" total.
```

## 4. Phase prompts (copy-paste ready)
- `docs/prompts/P1-polish.md`
- `docs/prompts/P2-sync.md`
- `docs/prompts/P3-ai-coach.md`
- `docs/prompts/P4-reminders-game.md`
- `docs/prompts/P5-wealth-pro.md`

## 5. Troubleshooting
| Symptom | Fix |
|---|---|
| App shows old version after deploy | Close and reopen the PWA (autoUpdate applies on next load). Hard refresh on laptop |
| "Data disappeared" | Data is per device and per browser until Phase 2. Check you're on the same device/browser. Restore from backup |
| Migration error on load | Revert the commit. Restore backup. Ask agent to write the migration with `.upgrade()` and a test using `fake-indexeddb` |
| iPad won't install | Open the HTTPS URL in **Safari** → Share → *Add to Home Screen* |
| Agent keeps adding libraries | Remind it: "No new dependencies. Use existing primitives." |
| Build chunk-size warning | Expected until P1-9 (code-splitting). Harmless |

## 6. Your weekly cadence as "product owner"
- **Daily (5 min):** use the app. Note friction in a `FEEDBACK.md` file (one line each).
- **Weekly (1–2 h):** turn the top 2 friction points into tickets, then build 1–3 tickets with the loop above.
- **Monthly:** re-read `00-MASTER-PLAN.md`. Does the app still serve the plan? Adjust the roadmap.
