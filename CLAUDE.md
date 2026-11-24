# My Sticky Notes: rules for Claude Code

Personal sticky-notes PWA (Next.js App Router + React + TypeScript + Tailwind v4 + Supabase Postgres),
synced between phone and laptop, hosted on Vercel Hobby. Code lives on GitHub; the user pushes.

## Hard rules for this machine (most important)

- NEVER run npm, npx, pnpm, yarn, bun, bunx, `next dev`, `next build`, tsc, or any
  install/build/test/lint command. This office computer is not allowed to run them.
  If something seems to need one, stop and ask the user.
- Create every file by hand. No generators (create-next-app, shadcn, prisma, etc.).
- Put dependencies straight into package.json with exact versions (no ^ or ~).
  Do not create a lockfile. Vercel installs and builds everything after the user pushes to GitHub.
- Nothing can be compiled here, so the code must build on Vercel on the first try. Before
  finishing any change, re-check every touched file:
  - each import path exists,
  - each imported package is in package.json,
  - there are no strict-TypeScript errors,
  - "use client" is on every component that uses hooks or browser APIs,
  - server-only code (database, secrets, node:crypto) is never imported by a client component.
- git is fine (init, add, commit). Don't push. The user pushes to GitHub.

## Stack (all free, nothing else)

- Next.js 16 App Router, React 19, TypeScript strict. Vercel Hobby, Node 24.
- Tailwind CSS v4, CSS-first: `@import "tailwindcss";` + `@theme` in app/globals.css,
  postcss.config.mjs with "@tailwindcss/postcss". No tailwind.config.js.
- Supabase Postgres (switched from Neon at the user's request) through the `postgres` driver
  (postgres.js v4, ESM only), server only, in lib/db.ts. Queries use `sql.unsafe(text, params)` with
  $1, $2 placeholders; never paste values into SQL text.
  - `prepare: false` is required: Supabase's transaction pooler (port 6543) has no prepared statements.
  - Query parameters are stripped from the connection string (Vercel's Supabase vars add
    `supa=base-pooler.x`, which postgres.js would send to the server); `sslmode` maps to the ssl option.
  - `parseConnection` in lib/db.ts splits the string by hand (password ends at the last `@`) and passes
    host, port, user and password as options, so passwords with `/ ? # @` work without percent-encoding.
  - Use the Transaction pooler string, never the direct connection (IPv6 only, unreachable from Vercel).
  - Row Level Security is enabled on `notes` and `login_attempts` with no policies, so Supabase's REST
    API keys can't read them.
  - `login_attempts` limits passcode guessing: 10 tries per address and 300 in total per 15 minutes
    (`app/api/login/route.ts`). Addresses are stored as a keyed hash.
  - Connection string: DATABASE_URL, else POSTGRES_URL (Vercel's Supabase integration), else the
    first env var ending in _DATABASE_URL or _POSTGRES_URL.
- Icons: lucide-react v1 (no brand icons; use canonical names, e.g. `Trash`, `Ellipsis`, `CircleAlert`).
- Font: Inter via next/font/google.
- No ORM, UI kit, state library, auth library, PWA plugin or date library.

Pinned versions (keep exact): next 16.4.5, react 19.3.1, react-dom 19.3.1,
postgres 4.1.1, lucide-react 1.65.0, typescript 5.9.3, @types/react 19.3.0,
@types/react-dom 19.3.0, @types/node 24.19.2, tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3,
postcss 8.5.32. Don't switch to TypeScript 7 (Next's type check needs the TS 5/6 JS API).

## Next.js 16 rules

- `params` and `searchParams` in pages and route handlers are Promises: await them. `cookies()` is async.
- Don't enable cacheComponents and don't use 'use cache'.
- No middleware/proxy file. Check auth in each page and in each route handler.
- Node.js runtime only, no Edge runtime.
- Never read env vars or create the database client at module top level. Do it lazily inside
  functions at request time, so the build passes before the database and env vars exist.

## Project map

- `app/page.tsx` home (server: setup check, auth check, renders `components/notes-app.tsx`)
- `app/login/page.tsx` onboarding + passcode; `app/share/page.tsx` Android share target
- `app/api/login`, `app/api/logout`, `app/api/notes`, `app/api/notes/[id]` JSON route handlers
- `app/icon.tsx`, `app/apple-icon.tsx`, `app/icons/*/route.tsx` PNG icons drawn with ImageResponse
- `lib/auth.ts`, `lib/db.ts` server only. `lib/notes.ts`, `lib/links.ts`, `lib/format.ts`,
  `lib/brand.ts` shared and pure. `lib/store.ts`, `lib/clipboard.ts` client only (local-first store + sync queue).
- `components/wall.tsx` + `lib/wall.ts` wall view for laptops (wide screen with a mouse): drag notes
  anywhere, double-click to stick, drop on the bin to crumple. Positions and the bin are per device
  (localStorage), not synced. Phones keep the grid.
- `public/sw.js` hand-written service worker (bump VERSION when it changes),
  `public/manifest.webmanifest` static manifest with share_target.
- `db/schema.sql` mirrors the CREATE TABLE that `lib/db.ts` runs on the first API call.

## Out of scope for now

Voice notes, reminders, dark mode, image attachments, export/import.
