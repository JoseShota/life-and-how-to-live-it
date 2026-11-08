# Sync browser test (two devices, no real server)

Checks the sync UI end to end in Chromium without touching the real Supabase project or real data.

- `mock-supabase.mjs`: a local stand-in for Supabase on port 4174. PGlite (dev dependency) runs every file in
  `supabase/migrations/`; auth is faked (any email, typed code `123456`, `/__link?email=` gives the sign-in link).
- `serve.mjs`: serves a build on port 4173.
- `two-devices.mjs`: drives a laptop (1366 px) and a touch tablet (820 px) through create, link, sync both ways,
  reset, re-link and delete-cloud. Uses the Playwright that is installed globally (`npm root -g`).

```bash
VITE_SUPABASE_URL=http://localhost:4174 VITE_SUPABASE_ANON_KEY=test-anon-key npx vite build --emptyOutDir --outDir /tmp/dist-sync
node scripts/sync-e2e/two-devices.mjs /tmp/dist-sync /tmp/sync-shots
```

It prints tap targets under 40 px, the confirmation texts, plaintext leaks on the server and console errors
(expected: none). If a run crashes, stop leftover servers on ports 4173/4174 before the next run.
