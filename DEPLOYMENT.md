# Deployment

RunPlan is self-hosted on Proxmox with a two-environment setup. **Never develop
directly on prod.**

## Environments

| Env     | CT  | URL                        | Branch | Deployed when                |
|---------|-----|----------------------------|--------|------------------------------|
| staging | 151 | http://192.168.50.86       | `dev`  | every push to `dev`          |
| prod    | 150 | https://runplan.tardi.dev  | `main` | push to `main` **+ CI green**|

## Workflow

1. Branch from `dev` (or commit straight to `dev` for small changes) and push.
2. A poller on the Proxmox host (`runplan-deploy.timer`, every 5 min) deploys
   `origin/dev` to staging automatically. CI (`.github/workflows/ci.yml`) runs
   lint, tests, migrations and a production build in parallel.
3. Verify on staging (test login: `jamie@staging.test`).
4. Merge `dev` → `main` and push. Prod deploys automatically once all GitHub
   checks on the `main` head commit are green. A commit with failing or
   still-running CI is never deployed.

## Notes

- Deploy state lives on the Proxmox host in `/var/lib/runplan-deploy/`
  (`<ct>.sha` = last deployed commit, `<ct>.failed` = commit that failed to
  deploy and won't be retried — delete the file or push a fix to unblock).
- Deploy logs: `journalctl -u runplan-deploy.service` on the host.
- Staging has a minimal `.env`: no Stripe/Google/SMTP keys (those features lie
  dormant), fresh Postgres, Garmin sync timer disabled.
- The deploy itself is `runplan-update` inside each CT
  (git pull → pnpm install → db:migrate → build → restart).
