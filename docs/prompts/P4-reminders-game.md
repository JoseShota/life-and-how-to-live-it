# Phase 4 prompts — Reminders & game depth

## P4-1 Web Push
```
Implement Web Push for the installed PWA. Generate VAPID keys (document the command; private key only as Supabase secret).
Client: subscribe in Settings (explain iPad requires the app installed to Home Screen, iPadOS ≥ 16.4),
store subscription in a push_subscriptions table. Use vite-plugin-pwa injectManifest strategy with a custom sw
that handles 'push' and 'notificationclick' (open the right route).
Server: Supabase cron (pg_cron) every 5 min → edge function 'notify' that sends due reminders in America/Mexico_City:
05:45 wake, 17:30 money check-in, 20:00 shutdown, 21:15 wind-down, card due D-3 and D-1 (needs synced accounts/transactions).
Per-reminder toggles in Settings. Quiet hours respected.
```

## P4-3 HP & streak shields
```
Implement HP/Energy and streak shields exactly as in @docs/04-GAME-DESIGN.md "Planned mechanics".
Pure functions in src/game/rules.ts (hpDelta(dayResult), shieldsEarned(streak)) with tests.
HP shown in HUD as a red bar under XP. Recovery mode banner when HP = 0. No XP is ever removed.
```

## P4-4 Seasons & boss fight
```
Add `seasons` table {id, name, start, end, bossName, bossHp, bossAreaIds[], rewardTitle}.
Boss HP decreases by focus minutes in its areas during the season + 200 per Epic quest.
Season screen with progress track and boss health bar; defeat → achievement + 1000 XP (refId season:<id>).
Seed Season 1 from docs/00-MASTER-PLAN.md §6 (Nov 2026 → Feb 2027).
```
