# RunPlan

Generate a periodised, science-based running training plan from a **goal race time**
(e.g. a sub-3 marathon), follow it week by week, tick off sessions, adjust it around your
race date, and export it to PDF. Built for high-volume runners.

- **Methodology:** Pfitzinger-style high-mileage periodisation (Endurance → Lactate
  threshold → Race prep → Taper, with 3-build/1-cutback volume cycling) and **Daniels
  VDOT** pacing (Easy / Marathon / Threshold / Interval / Rep zones derived from your goal).
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Drizzle
  ORM · Postgres. Email/password auth. Mobile-first, light/dark themes.

## Quick start

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm setup     # generate + apply the database migrations
pnpm dev       # http://localhost:3000
```

That's it — no Docker or database server needed for local development.

### Database

By default the app uses **PGlite** — real Postgres compiled to WebAssembly, running
in-process and persisted to `./.pglite`. This keeps local dev zero-config.

To use a **real Postgres server** (recommended for production — Neon, Supabase, RDS, or
the bundled `docker compose up -d`), set `DATABASE_URL` in `.env` and run `pnpm setup`.
The app switches to the postgres.js driver automatically.

```env
# .env
SESSION_SECRET=<random 32+ char string>
# DATABASE_URL=postgres://user:pass@host:5432/runplan   # optional; PGlite if unset
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm test` | Run the plan-engine unit tests (Vitest) |
| `pnpm db:generate` | Generate a Drizzle migration from the schema |
| `pnpm db:migrate` | Apply migrations (run with the dev server stopped for PGlite) |
| `pnpm db:reset` | Wipe the local PGlite database and re-migrate |
| `pnpm lint` | ESLint |

## How it works

- `src/lib/plan/` — the pure, unit-tested engine:
  - `vdot.ts` — Daniels–Gilbert VDOT maths and training-pace zones
    (validated: VDOT 50 → 5K 19:57; a sub-3 marathon → VDOT ≈ 53.5, MP ≈ 4:16/km).
  - `goal.ts` — goal/current VDOT and a feasibility assessment.
  - `periodize.ts` — phases, the volume ramp, and cutback/taper weeks.
  - `buildWeek.ts` — day-by-day session allocation to hit each week's volume target.
  - `generatePlan.ts` — ties it together into a full plan.
- `src/db/` — Drizzle schema + client. `src/lib/auth/` — session auth.
- `src/app/` — App Router pages (dashboard, plan builder, plan view, settings) and
  API route handlers. `src/components/` — UI.

The engine is dependency-free and runs both on the server (for persistence) and in the
browser (for the live preview in the plan builder).

## Features

- **Plan builder** with sensible inputs and a live preview (feasibility, paces, volume
  chart) that updates as you type.
- **Plan view** — colour-coded weekly calendar, tap-to-complete sessions, inline editing,
  and per-week / overall progress.
- **Adjust race date** — rebuilds the plan around a new date while preserving completed
  sessions.
- **PDF export** — a clean, printable week-by-week plan.
- **Garmin sync** — connect your Garmin account in Settings (MFA supported) and recent
  runs are matched to planned sessions (by date and distance) and ticked off automatically,
  with actual distance/time recorded. Manual "Sync now" plus an optional scheduled sync via
  `POST /api/garmin/sync-all` guarded by `CRON_SECRET`. Uses the unofficial Garmin
  Connect API (`@flow-js/garmin-connect`) with an in-house SSO/MFA flow; passwords are
  never stored, only OAuth tokens.
- **FIT workout export** — download any planned session as a structured `.fit` workout
  (warm-up / reps / recoveries / cool-down with pace targets, encoded with the official
  `@garmin/fitsdk`) and copy it to your watch's `GARMIN/Workouts` folder over USB.
- **Workout detail page** — planned vs actual plus the linked Garmin activity: route map
  (Leaflet/OSM), heart-rate / pace / elevation charts, and a laps table. Activity detail is
  fetched once and cached. No API? Upload the activity's `.fit` (or "Export Original"
  `.zip`) manually and get the same page.
- **Account security** — strong password policy, rate-limited auth, email verification,
  password reset (bring your own SMTP), **Google sign-in**, and **passkey sign-in**
  (WebAuthn): fingerprint/face login on any device, including the Android app.
- **Switchable units** (km ⇄ mi), **light/dark theme**, **adjustable text size**, fully
  mobile-friendly.
- **Installable app** — RunPlan is a PWA (manifest + service worker + offline fallback) and
  ships an Android APK (Trusted Web Activity built with Bubblewrap; download it from
  Settings → Install the app, or `/runplan.apk`). `.well-known/assetlinks.json` carries the
  signing-key fingerprint so the app runs full-screen.

## Documentation

| Doc | Covers |
| --- | --- |
| [docs/garmin.md](docs/garmin.md) | Connecting Garmin (incl. MFA), how syncing matches runs, the workout detail page, manual FIT upload, troubleshooting |
| [docs/fit-export.md](docs/fit-export.md) | Exporting planned sessions as structured `.fit` workouts for the watch |
| [docs/android-app.md](docs/android-app.md) | Installing as an app (PWA / Android APK), TWA architecture, rebuilding and signing the APK |
| [docs/deployment.md](docs/deployment.md) | Environment variables, systemd units, updating, the scheduled Garmin sync, HTTPS notes |
