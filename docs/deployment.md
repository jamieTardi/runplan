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

## Reverse proxy / HTTPS

Any TLS-terminating proxy in front of port 80 works. HTTPS is required for PWA install,
the service worker, and Android TWA verification. If the app was previously used over
plain HTTP with `ALLOW_INSECURE_COOKIES=1`, remove that variable once HTTPS is on.
