# Phase 2 prompts — Cloud sync (Supabase)

Prereqs (you, not the agent): create a free Supabase project. Copy the Project URL and anon key into `.env.local`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Enable Email (magic link) auth. **Export a backup from the app before starting.**

## P2-0 Design review (Plan mode)
```
Read @docs/02-ARCHITECTURE.md "Sync design" and @docs/03-DATA-MODEL.md.
Propose the final sync design for Life and How to Live It with Supabase: SQL schema for every table (snake_case,
user_id uuid references auth.users, updated_at bigint, deleted_at bigint null, RLS policies),
the client algorithm (push/pull cursors, LWW, tombstones, xp ledger union, settings per-key LWW,
activeTimer excluded from sync), failure handling (offline, partial push), and a test strategy
with two simulated clients using fake-indexeddb. Compare briefly with Dexie Cloud and recommend.
No code yet.
```

## P2-1/2 Schema + local migration
```
Implement P2-1 and P2-2 from the approved design.
- supabase/migrations/0001_init.sql with tables + RLS (+ indexes on (user_id, updated_at)).
- Dexie version(2): add updatedAt/deletedAt to syncable tables, backfill in upgrade().
- Create src/db/write.ts helpers (put/update/softDelete) that always set updatedAt; refactor all writes to use them.
- Reads must filter out deletedAt rows (add a helper). Tests for migration and helpers.
```

## P2-3/4/5 Auth + sync engine
```
Implement P2-3..P2-5: @supabase/supabase-js (pin version), src/sync/client.ts, src/sync/engine.ts.
Settings: "Sign in to sync" (magic link), status (last synced, pending count), "Sync now".
Engine triggers: app focus, every 60s while visible, 3s debounce after local writes.
HUD shows a small cloud icon (synced / syncing / offline / error).
Two-client test: create on A, edit on B, delete on A → both converge. .env.example committed, .env.local gitignored.
```
