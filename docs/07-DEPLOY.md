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
- **Lenovo / any Android tablet:** open the URL in **Chrome** (not the Lenovo or Samsung browser) → menu ⋮ → **Install app** (on some versions: **Add to Home screen → Install**). Chrome builds a real launcher app (a WebAPK): it has its own icon in the app drawer, opens full screen, and updates itself. No Play Store needed.
- **Laptop (Chrome/Edge):** the install icon in the address bar → **Install**.
- **iPad/iPhone (if ever):** Safari → Share → **Add to Home Screen**.

Open the app once while online. After that it works fully offline, including fonts and the marble head, which are all precached.

## Sync between tablet and laptop (Phase 2)
Sync runs through **your own** free Supabase project. Everything is encrypted on the device with a passphrase only you know; Supabase stores unreadable bytes under opaque ids (design in `02-ARCHITECTURE.md`, "Sync design"). A build without the two variables below simply has no sync.

### One-time setup (about 15 minutes)
1. **Create the project.** supabase.com → New project (the free plan is enough). No GitHub connection is needed. Region: Americas (or the closest specific one, e.g. East US). Keep the database password in your password manager; the app never needs it. Security: keep **Enable Data API** on (the app calls the sync functions through it), turn **Automatically expose new tables** off (the migration grants exactly what it needs), and **Enable automatic RLS** on (the migration enables RLS on its tables anyway).
2. **Create the tables and functions.** Dashboard → **SQL Editor** → New query → paste all of `supabase/migrations/0001_sync.sql` → **Run**. Running it again is safe.
3. **Email sign-in.** Dashboard → **Authentication → Sign In / Providers → Email**: enabled.
4. **Where the sign-in link returns.** Dashboard → **Authentication → URL Configuration**: **Site URL** = `https://life-and-how-to-live-it.vercel.app`; under **Redirect URLs** add `https://life-and-how-to-live-it.vercel.app/**` (and `http://localhost:5173/**` for `npm run dev`). The default email (no template editing, no SMTP needed) carries a link: open it **on the device you are signing in** and the app opens signed in. If you ever set up custom SMTP, you can add `{{ .Token }}` to the "Magic link or OTP" and "Confirm sign up" templates, and the app also accepts the typed code.
5. **Copy the keys.** Dashboard → **Project Settings → API Keys** (or **Data API**): the **Project URL** and the **anon** (or **publishable**) key. Both are public by design: the key only lets a signed-in user call the five sync functions on their own rows. **Never** copy the `service_role` / secret key anywhere.
6. **Give them to Vercel.** Vercel → the project → Settings → **Environment Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, with exactly those names (Production; Preview too if you want sync on preview builds). For `npm run dev`, put the same two lines in `.env.local` (git-ignored; see `.env.example`).
   - **Then build again**: the values are baked in when the app is built, so a deployment made before you added them has sync off. Deployments → the top **Production** deployment (status Ready) → **⋯** at the end of its row → **Redeploy**. If Redeploy isn't offered, any new commit merged into `main` triggers a fresh production build too.
   - **Check**: Control → Sync shows an email box. If it says "This build has no sync server", the build ran without the variables (or with a misspelled name).
7. **After both devices are signed in** (optional, recommended): Authentication → Sign In / Providers → turn off **Allow new users to sign up**, so nobody else can create accounts on your project (they could never read your data, but they would use your quota).

### Turning it on
1. **First device** (whichever has the data you want to keep; on a fresh start, either): Control → **Sync** → your email → **Email me a sign-in link** → open the email on that device and tap the link → choose a passphrase (12+ characters; four unrelated words work well) → **Encrypt and upload**.
2. **Second device:** Control → **Sync** → same email → tap the new link on that device → the same passphrase → **Link this device**. It downloads a backup file of itself first, then takes the cloud copy.
3. A cloud glyph appears next to your drachmae: a tick when synced, struck through when offline (changes wait and go out later), a mark when it needs you (sign in again, re-enter the passphrase, or reload to update). Tap it to open Control → Sync.

Sync runs when the app opens or comes back into view, when the network returns, every minute while open, and 3 seconds after a change. The running timer, the last-backup date, the ticker switch and the last expense category stay on each device.

**If you forget the passphrase:** nobody can read the cloud copy, you included. Your devices and backup files still have everything: on one device, Control → Sync → **Delete cloud copy**, create it again with a new passphrase, and link the other device again.

Supabase's built-in email sender allows only a couple of emails an hour, and only to the email addresses of your Supabase organization's members: sign in with the email you use for Supabase. Each link works once and expires after an hour.

## Reminders on day 1
Settings → **Download routine (.ics)** → open it on each device (or import into Google Calendar,
which syncs to both). Your calendar handles the 05:45 / 21:45 alerts until Web Push ships in Phase 4.
