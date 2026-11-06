# 07 · Deploy & install on tablet + laptop

A PWA must be served over **HTTPS** to be installable. Easiest options (both free):

## Option A — Vercel (recommended)
1. Push the repo to GitHub (private is fine).
2. vercel.com → *Add New Project* → import the repo. Framework: **Vite**. Build: `npm run build`. Output: `dist`.
3. Add a SPA rewrite so deep links work. `vercel.json` is already in the repo:
   `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
4. Every `git push` to `main` redeploys. The installed app updates itself on the next open.

**Live:** https://life-and-how-to-live-it.vercel.app (since 2026-11-06). Production branch is `main`
(GitHub default branch too; Vercel: Settings → Environments → Production → Branch Tracking).
Agent work happens on `claude/*` branches and only reaches the installed app once merged into `main`.
Install the app **from this production URL only**: each URL keeps its own local data, so an app
installed from a Preview URL would hold its data apart from the real one.

## Option B — Cloudflare Pages
Build command `npm run build`, output `dist`. The `public/_redirects` file (`/* /index.html 200`) handles SPA routing.

## Install
- **Lenovo / any Android tablet:** open the URL in **Chrome** (not the Lenovo or Samsung browser) → menu ⋮ → **Install app** (on some versions: **Add to Home screen → Install**). Chrome builds a real launcher app (a WebAPK): it has its own icon in the app drawer, opens full screen, and updates itself. No Play Store needed.
- **Laptop (Chrome/Edge):** the install icon in the address bar → **Install**.
- **iPad/iPhone (if ever):** Safari → Share → **Add to Home Screen**.

Open the app once while online. After that it works fully offline, including fonts and the marble head, which are all precached.

## Important: data per device (until Phase 2)
Each device has its own local database. Pick **one main device** for logging, or move data with
Settings → **Export backup** (on device A) → **Import backup** (on device B). Phase 2 (Supabase sync) removes this step.

## Reminders on day 1
Settings → **Download routine (.ics)** → open it on each device (or import into Google Calendar,
which syncs to both). Your calendar handles the 05:45 / 21:45 alerts until Web Push ships in Phase 4.
