# My Sticky Notes

A personal sticky-notes app that syncs between your phone and your laptop.

The typical use: you see an AI tool in an Instagram reel, share the link to My Sticky Notes from
your phone, and open it later on your office laptop. Notes open instantly from a local cache,
keep working offline, sync through a free Supabase Postgres database, and the app installs on your
phone's home screen like a native app.

- Colorful sticky notes with titles, text, links, folders, icons, dates, pins and a done state.
- Links are detected automatically. Each card shows the first link's favicon and domain; tap it to
  open the link directly.
- Android share target: share from Instagram, Chrome, YouTube and more straight into a new note.
- Local-first: changes save instantly on the device and sync in the background.
- One passcode, no accounts. Each device logs in once and stays logged in for a year.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, lucide-react and
Supabase Postgres (through the `postgres` driver). Hosted for free on Vercel Hobby.

## Environment variables

Add these in Vercel → your project → Settings → Environment Variables.

| Name             | What it is                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `APP_PASSCODE`   | The passcode you type to unlock the app.                                                           |
| `SESSION_SECRET` | A long random string (32+ characters) that signs the login cookie.                                |
| `DATABASE_URL`   | Your Supabase connection string (Transaction pooler, port 6543). Not needed if you connect Supabase from Vercel's Storage tab. |

Connecting Supabase from Vercel's Storage tab adds `POSTGRES_URL` (and a few other variables) for you,
and the app uses it automatically. It also accepts any variable whose name ends in `_DATABASE_URL`
or `_POSTGRES_URL` (what Vercel creates if you give the database a custom prefix).

If you copy the connection string from Supabase yourself, use **Connect → Transaction pooler**
(port 6543) and fill in your database password. Don't use the "Direct connection" string: Vercel
can't reach it.

To make a good `SESSION_SECRET`, use a password manager's generator (40+ random characters), or
any long random string you don't use anywhere else.

If a variable is missing, the app shows a setup screen listing what to add instead of crashing.

## Deploy (all free)

1. **Push to GitHub.** Create an empty GitHub repository and push this folder to it.
2. **Import into Vercel.** On [vercel.com](https://vercel.com), choose Add New → Project and import the
   repository. Keep the defaults (framework: Next.js) and deploy. The first deploy shows the setup
   screen, which is expected.
3. **Add a free Supabase database.** In the Vercel project, open the **Storage** tab → Create Database →
   **Supabase** → free plan. Connect it to the project (all environments). This adds `POSTGRES_URL`
   for you. The `notes` table is created automatically on first use, with Row Level Security turned on
   so Supabase's public API keys can't read your notes.
   (Already have a Supabase project? Add its Transaction pooler connection string as `DATABASE_URL`
   instead.)
4. **Add the two secrets.** Settings → Environment Variables → add `APP_PASSCODE` and
   `SESSION_SECRET`.
5. **Redeploy.** Deployments → the latest deployment → ⋯ → Redeploy. Environment variable changes
   only apply to new deployments.

Open your Vercel URL, go through the three welcome slides, and enter your passcode.

## Install on your phone

**iPhone or iPad (Safari):** open the app URL, tap the **Share** button, then **Add to Home Screen**.
The "Install app" button in the app shows the same steps.

**Android (Chrome):** open the app URL and tap **Install app** in the top bar (or Chrome's ⋮ menu →
Install app / Add to Home screen).

On a laptop, Chrome and Edge show the same **Install app** button, which adds the app to your dock
or Start menu.

## Save links from Instagram (Android)

1. Install the app on your Android phone first (see above). Android only lists installed web apps
   in the share sheet.
2. In Instagram, open a reel or post → **Share** (paper plane) → **Share to…** (or ⋯ More) →
   **Sticky Notes**.
3. A new note opens with the link already filled in. Add a title if you like and tap **Done**.

It works with any app that shares a link (Chrome, YouTube, X, Reddit…). If the phone is offline,
the note is saved on the phone and syncs when you're back online.

iPhone doesn't let web apps appear in the share sheet. On iPhone, copy the link, open the app,
tap **+**, then tap the orange **+** tile in the Links row to paste it.

## Logging out

Tap the round **M** avatar → **Log out**. This logs out the current device and removes its local copy
of your notes (your notes stay safe in the database).

**Log out every device at once:** change `SESSION_SECRET` in Vercel (Settings → Environment
Variables) and redeploy. Every existing login stops working, and each device asks for the passcode
again. Changing `APP_PASSCODE` alone does not log anyone out.

## If syncing stops after a break

Supabase pauses free projects that have had very little activity for about a week. Your notes stay
on your devices and you can keep adding them, but the sync icon shows a problem until the database
is back. To fix it, open [supabase.com](https://supabase.com/dashboard), select the project and
choose **Restore project**. Nothing is lost; pending changes sync once it's running again.

## Keyboard shortcuts (laptop)

When you're not typing in a field: **N** new note, **/** search, **Esc** close.

## If a Vercel build fails

Open the failed deployment in Vercel, copy the build log error (the red lines near the end), and
paste it into Claude Code with "This Vercel build failed, please fix it." Then commit, push, and
Vercel builds again automatically.

## How sync works

- Notes and a queue of pending changes are kept in the browser's localStorage, so the app opens
  instantly and works offline.
- Every change updates the screen right away, goes into the queue, and is sent to the server in the
  background, with retries and backoff when the network is down.
- The app syncs when it opens, when the window gets focus, when the tab becomes visible again, when
  the device comes back online, and every 60 seconds only while the window is focused. When you're not
  using it, it makes no requests at all.
- Conflicts use last-write-wins on each note's `updatedAt`.

## Project layout

```
app/
  page.tsx                 Home (setup check, login check, then the notes app)
  login/page.tsx           Welcome slides (once per device) and passcode screen
  share/page.tsx           Android share target
  api/login, api/logout    Session cookie
  api/notes, api/notes/[id]  List, upsert (last-write-wins) and delete notes
  icon.tsx, apple-icon.tsx, icons/*/route.tsx   App icons drawn in code
components/                UI (notes app, sticky cards, editor sheet, pickers, toasts…)
lib/
  auth.ts, db.ts           Server only: passcode, signed cookie, Supabase Postgres queries
  notes.ts, links.ts       Shared: note model, validation, link detection
  store.ts                 Client: local-first store and sync queue
public/
  manifest.webmanifest     PWA manifest with the share target
  sw.js                    Service worker (offline app shell)
db/schema.sql              The table the app creates automatically
```

## Running locally (optional, not on the office computer)

On a computer where installing packages is allowed: copy `.env.example` to `.env.local`, fill in the
values (Supabase's Transaction pooler string works from anywhere), then run `npm install` and
`npm run dev`.
