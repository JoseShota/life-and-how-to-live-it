# 07 · Deploy & install on tablet + laptop

A PWA must be served over **HTTPS** to be installable. Easiest options (both free):

## Option A — Vercel (recommended)
1. Push the repo to GitHub (private is fine).
2. vercel.com → *Add New Project* → import the repo. Framework: **Vite**. Build: `npm run build`. Output: `dist`.
3. Add a SPA rewrite so deep links work. `vercel.json` is already in the repo:
   `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
4. Every `git push` to `main` redeploys. The installed app updates itself on the next open.

## Option B — Cloudflare Pages
Build command `npm run build`, output `dist`. The `public/_redirects` file (`/* /index.html 200`) handles SPA routing.

## Install
- **iPad:** open the URL in **Safari** → Share → **Add to Home Screen**.
- **Android tablet:** Chrome → menu → **Install app**.
- **Laptop (Chrome/Edge):** the install icon in the address bar → **Install**.

## Important: data per device (until Phase 2)
Each device has its own local database. Pick **one main device** for logging, or move data with
Settings → **Export backup** (on device A) → **Import backup** (on device B). Phase 2 (Supabase sync) removes this step.

## Reminders on day 1
Settings → **Download routine (.ics)** → open it on each device (or import into Google Calendar,
which syncs to both). Your calendar handles the 05:45 / 21:45 alerts until Web Push ships in Phase 4.
