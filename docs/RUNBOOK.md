# RPK Runbook

## Cloudflare staging connection

1. Never paste a Cloudflare token into chat or a repository file.
2. Use the GitHub `staging` Environment for staging secrets and variables; use the separate `production` Environment for production.
3. Create the staging D1 first and replace only the staging placeholder ID in `wrangler.production.jsonc`.
4. Apply `npm run db:migrate:staging`, then manually run **Deploy Cloudflare → staging**.
5. Do not create or touch production data until staging health, locale, noindex, API contract and repeated semantic-write checks pass.
6. `ENABLE_PRODUCTION_COLLECTOR` must remain absent or `false`; `RPK_RETAIN_FLIGHT_CHANGE_HISTORY` must remain absent or `false`.

## Site does not open

1. Open GitHub → Actions → latest CI and Deploy Cloudflare runs.
2. If CI is red, open the first failed step; do not rerun deployment until CI is green.
3. In Cloudflare → Workers & Pages → retailpulse-korea, check the latest deployment and logs.
4. If only the domain fails but `workers.dev` works, check the custom domain DNS/SSL state.

## API data does not arrive

1. Open `/api/health`; confirm app, database and source statuses.
2. In Cloudflare Worker logs, look for the source ID and error category, not the secret URL.
3. Check that the source key exists in Worker Settings → Variables and Secrets.
4. Confirm official quota/maintenance. Keep the UI STALE or MISSING; never type in replacement numbers.

## GitHub Action fails

1. Open the failed job and first red step.
2. CI failure means code is not released. Fix it on a branch and rerun.
3. Deploy failure with green CI usually means Cloudflare token, account ID, origin or permissions.
4. For collection, use **Collect Production Data → Run workflow** only after `ENABLE_PRODUCTION_COLLECTOR=true` and all collector secrets exist.
5. If the repository has had no activity for 60 days, confirm scheduled workflows are still enabled. Never backdate `retrievedAt` to a missed nominal schedule.

## D1 quota or migration issue

1. Open Cloudflare → D1 → Metrics and check rows read/written and storage.
2. At high usage, reduce collector frequency and stop nonessential collection.
3. Before a migration, confirm the Free plan Time Travel window; restore if the migration damages data.
4. Never delete the database to fix a schema problem without an export/recovery check.
5. At 70% record NOTICE. At 85% disable change history/optional backfills. At 95% stop noncritical collection and show DEGRADED/PAUSED.
6. Never delete immutable prediction or outcome rows to recover space.

## Domain fails

1. Confirm the domain exists in the user’s Cloudflare account.
2. Check Worker → Settings → Domains & Routes → Custom Domain.
3. Pick one canonical host (apex or `www`) and permanently redirect the other.
4. Verify HTTPS, `/ko`, `/en`, `/zh`, `/ja`, `/sitemap.xml` and `/robots.txt` while signed out.

## Recovery rule

Do not change production data manually to make a chart look normal. If live collection fails, show the last timestamp as STALE and keep official historical data available.
