# Deployment

RunPlan is a standard Next.js app: `pnpm install && pnpm setup && pnpm build && pnpm start`.
This page covers the production details beyond the README quick start.

## Environment (`.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | signs session cookies — 32+ random chars |
| `DATABASE_URL` | production | Postgres connection string (PGlite is used when unset — dev only) |
| `CRON_SECRET` | for scheduled Garmin sync | shared secret for `POST /api/garmin/sync-all` |
| `ALLOW_INSECURE_COOKIES=1` | only for plain-HTTP LAN deployments | drops the `Secure` cookie flag; remove behind HTTPS |
| `APP_URL` | for password reset + passkeys | public base URL, e.g. `https://runplan.example.com` — used in reset-email links and as the WebAuthn origin/RP ID |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | for password-reset & verification emails | any SMTP provider. Unset = the flows still respond normally but no email is sent (logged server-side) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for "Continue with Google" | OAuth web client from the [Google Cloud console](https://console.cloud.google.com/apis/credentials); authorized redirect URI must be `${APP_URL}/api/auth/google/callback`. Unset = the Google buttons are hidden |

A good free SMTP provider is [Resend](https://resend.com) (3k emails/month): verify your
domain with the 3 DNS records they give you, create an API key, then

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<api key>
SMTP_FROM="RunPlan <runplan@your-domain>"
```

## Systemd service

```ini
# /etc/systemd/system/runplan.service
[Unit]
Description=RunPlan
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=runplan
WorkingDirectory=/opt/runplan
ExecStart=/usr/bin/pnpm start
Environment=PORT=80
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Updating

```bash
cd /opt/runplan
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
systemctl restart runplan
```

Migrations are additive SQL in `drizzle/`, applied by `pnpm db:migrate`. Note that Next
snapshots the `public/` directory listing at boot — restart after dropping new files
there (e.g. a rebuilt `runplan.apk`).

## Scheduled Garmin sync

Set `CRON_SECRET` in `.env`, then run something like this twice a day:

```bash
#!/bin/bash
# /usr/local/bin/runplan-garmin-sync
set -e
SECRET=$(grep ^CRON_SECRET /opt/runplan/.env | cut -d= -f2)
curl -sf -X POST -H "x-cron-secret: $SECRET" http://localhost/api/garmin/sync-all
echo
```

```ini
# /etc/systemd/system/runplan-garmin-sync.service
[Unit]
Description=RunPlan Garmin activity sync
After=runplan.service
Requires=runplan.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/runplan-garmin-sync
```

```ini
# /etc/systemd/system/runplan-garmin-sync.timer
[Unit]
Description=RunPlan Garmin activity sync (midday and evening)

[Timer]
OnCalendar=*-*-* 12,22:00:00
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload && systemctl enable --now runplan-garmin-sync.timer
```

The endpoint returns per-user results and logs failures; a user whose tokens went stale
just reconnects in Settings.

## Account security

- **Password policy**: minimum 10 characters with a letter, a number and a special
  character, plus a small common-password denylist — enforced server-side on sign-up,
  change and reset. Login and registration are rate-limited per IP/email.
- **Google sign-in**: sign-up and sign-in once `GOOGLE_CLIENT_ID`/`SECRET` are set.
  Google identities live in `oauth_accounts` (extensible to more providers); an existing
  password account with the same Google-verified email is linked automatically, and
  Google-created accounts have no password until one is set via the reset flow.
- **Email verification**: sign-ups get a 24h verification link; status and resend live in
  Settings → Account. Google sign-ups with verified emails skip it.
- **Password reset** emails require the `SMTP_*` variables and `APP_URL`. Tokens are
  single-use, SHA-256-hashed at rest, valid for 1 hour, and a successful reset signs the
  user out everywhere. The endpoint is rate-limited and never reveals whether an address
  has an account.
- **Passkeys (WebAuthn)** need no configuration beyond `APP_URL` and HTTPS. Users add a
  passkey in **Settings → Passkeys** (fingerprint/face/PIN on that device) and can then
  use *Sign in with a passkey* on the login page — including inside the Android app.
  Passkeys are origin-bound: they only work on the `APP_URL` domain, not via a LAN IP.

  Android field notes: creation deliberately doesn't force a provider — Android shows
  its "save passkey to…" sheet, where third-party providers (Bitwarden/Vaultwarden,
  Android 14+, enable *Use Bitwarden for passkeys* in the app) can be chosen. If the
  ceremony lands in an NFC "security key" reader dialog, a contactless card near the
  phone (wallet case!) is hijacking it — move the card or toggle NFC off. A hung or
  erroring Google Password Manager usually wants a Play services update; RunPlan retries
  creation once with relaxed options on a bare `UnknownError`, and every prompt has a
  Cancel and a 75s timeout so the UI can't be trapped.

## Reverse proxy / HTTPS

Any TLS-terminating proxy in front of port 80 works. HTTPS is required for PWA install,
the service worker, and Android TWA verification. If the app was previously used over
plain HTTP with `ALLOW_INSECURE_COOKIES=1`, remove that variable once HTTPS is on.
