# Garmin integration

RunPlan connects to a Garmin account to automatically tick off planned sessions from real
watch activities, and shows the full activity (map, heart rate, pace, laps) on each
workout's detail page.

> **Heads up:** activity sync uses Garmin's *unofficial* Connect API (the official
> [Connect Developer Program](https://developer.garmin.com/gc-developer-program/) is
> business-only). It can break if Garmin changes their endpoints. Everything degrades
> gracefully: already-synced data is cached locally, and the
> [manual FIT upload](#manual-fit-upload) works with no API at all.

## Connecting

**Settings → Garmin Connect.** Sign in with your Garmin email and password:

- The password is used once for the SSO token exchange and **never stored** — only the
  resulting OAuth tokens are kept (in the `garmin_accounts` table). Tokens auto-refresh.
- **Two-factor (MFA) accounts are supported.** Garmin sends a verification code; enter it
  in the second step. The pending sign-in is held server-side for 5 minutes.
- The SSO flow is implemented in-house (`src/lib/garmin/sso.ts`, modelled on
  [garth](https://github.com/matin/garth)) because the underlying library can't do MFA.

Disconnecting deletes the stored tokens; completed workouts keep their data.

## How syncing works

A sync (manual button or schedule):

1. Fetches recent activities since the last sync, with a 3-day grace window for late
   uploads (30-day lookback on first sync).
2. Filters to running activities (road / trail / treadmill / track / virtual).
3. Matches each run to a planned workout on the **same calendar date** with the
   **closest planned distance**. Doubles work: the longest run claims its best match
   first, so a shakeout won't steal the main session. Rest days and already-completed
   workouts are never touched.
4. Marks matches complete with the actual distance, time, completion timestamp, a
   "Synced from Garmin" note (existing notes are preserved), and a link to the Garmin
   activity (`workouts.garmin_activity_id`).

Trigger it three ways:

| Trigger | How |
| --- | --- |
| Manual | **Sync now** in Settings |
| Per user, API | `POST /api/garmin/sync` (session auth) |
| All users, scheduled | `POST /api/garmin/sync-all` with header `x-cron-secret: $CRON_SECRET` |

For scheduled syncs set `CRON_SECRET` in `.env` and call the endpoint from cron/systemd —
see [deployment.md](deployment.md#scheduled-garmin-sync) for ready-made systemd units.

## Workout detail page

Click a workout → **Details** (or `/workouts/<id>`): planned vs actual, then the linked
Garmin activity — stat tiles, an OpenStreetMap route trace, heart-rate / pace / elevation
charts with a crosshair tooltip, and a laps table.

Activity detail (summary + splits + downsampled sensor series + GPS polyline) is fetched
from Garmin **once** on first view and cached in `garmin_activity_cache`, so pages stay
fast and survive future API breakage.

## Manual FIT upload

The API-free fallback. On any workout detail page without a linked activity (and in the
Garmin panel's error state):

1. In Garmin Connect, open the activity → ⚙ → **Export Original**.
2. Upload the downloaded `.zip` (or the `.fit` inside it) via **Upload .fit file**.

The file is parsed locally with the official [`@garmin/fitsdk`](https://www.npmjs.com/package/@garmin/fitsdk)
decoder and produces exactly what a sync would: completion, actuals, and the full detail
panel. Uploaded activities get synthetic negative IDs so they can't collide with real
Garmin activity IDs.

## Troubleshooting

- **"Garmin sign-in failed"** — check the email/password; Garmin answers a bad credential
  POST with HTTP 401. Repeated attempts can hit their rate limit (wait a few minutes).
- **"This sign-in attempt expired"** — the MFA code window (5 min) lapsed; start again.
- **Sync errors after working previously** — Garmin may have rotated/invalidated tokens or
  changed an endpoint. Disconnect and reconnect first; if that fails, check for an updated
  `@flow-js/garmin-connect` and fall back to manual FIT uploads meanwhile.
- **A run matched the wrong session** — open the workout, untick it, edit as needed; the
  sync never overwrites manual edits on completed workouts.
