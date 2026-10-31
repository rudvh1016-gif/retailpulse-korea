# D1 read efficiency — 2026-10-31

Baseline main: `bfe488d059850bf70d545f3b04ecd2b3fc66bf63`.
Owner request: reduce daily free database reads, preserve functionality/data accuracy/free operation, verify and deploy. No paid plan, new credential, scheduler, provider call, table/index migration or canonical data mutation.

## Official baseline, not returned-row estimates

Existing manual [usage diagnostic 41156980792](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41156980792) ran once on main using its existing approved credentials. It completed successfully. Full output is retained in the run log; selected machine-readable evidence is `D1_READ_USAGE_BASELINE_2026-10-31.json`.

- UTC 2026-10-30: **4,622,061 rows read (92.44% of 5M)**; 52,426 written (52.43% of 100k).
- UTC 2026-10-28: **5,143,340 read**, as reported by official analytics; do not infer exact enforcement timing from aggregate counters.
- Largest yesterday SQL: raw historical flight baseline count, 683,309 read / 607 calls. Two monthly forecast shapes used 337,500 and 224,743 rows. Coverage accounting used 286,730; prediction evidence query 252,863.
- Single-day forecast shape: 196,582 read / 454 calls but only 21,792 rows returned (48/call). Another identical semantic shape used 61,421 / 142 calls.
- Uncached airport route replays: today flights 1,109 read, yesterday 1,096, airport-days/months 63 each; all zero written.
- Collector ledger is only a lower bound, not an account total: it excludes some maintenance and all visitor reads. Lower collector counters do not establish that collection is cheap overall.

[Cloudflare pricing](https://developers.cloudflare.com/d1/platform/pricing/) checked 2026-10-31: Free includes 5M reads/day and 100k writes/day; scans, not returned rows or request counts, determine consumption. No free-tier capacity guarantee is made.

## Minimal changes

1. **Single-day departure forecast:** use the already-required `airport_passenger_forecast_month_idx` explicitly. The optimizer otherwise selects the time-ordered index and walks irrelevant arrival/component rows. Keep exact projection, filter, order and LIMIT 96 in both initial HTML answer and A5 stored-coverage reader. No change to coverage admission, retry, collection cadence or provider budget.
2. **Future summary:** skip the two historical raw-flight counts only where future flightRows are deliberately empty and flightRecords comparisons are always null. Today/past keep their reads; no precomputed aggregate is substituted for raw corrected history.
3. **Prediction evidence:** admit only exact public GET/HEAD `/api/live/predictions` to the existing named cached entrypoint, using the route's unchanged 60s browser/120s shared TTL. Key keeps first area (absent defaults, invalid remains invalid) and server KST day. Strip browser bypass headers only on this public header-independent route. Invalid 400 and existing error 503 remain no-store; explicit D1 success:false now fails closed to 503 rather than becoming a shared empty/partial response. No private route, whole-worker cache, forecast archive or outcome record changes.
4. **Measurement:** existing `usage` diagnostic adds one old/new single-day query pair using the application's exported SQL. Zero writes/retries; output changes between sequential reads mean inconclusive, not a pass. No workflow or token change.

## Measured local comparison

Real local Workerd D1, full current migration set, 384-row production-shaped day (48 departure aggregate rows plus arrival/components): **384→96 rows read**, same 48 rows, **0 writes**. This is LOCAL_WORKERD, not production billing. Empty day, additional sources, extra terminal, original cap/order and missing-index failure are tested. Summary's existing three-day query already selects the efficient index, so it was deliberately left unchanged.

Remote before/after meta and post-deployment cache-hit evidence remain pending until the proposed revision is published. Account-wide daily savings also depend on traffic mix/cache locality; 75% is the measured fixture query reduction, NOT an account-wide promise.

## Alternatives rejected / preserved boundaries

- New covering flight index could reduce the largest count query but adds build/write/storage cost; not introduced without remote sizing evidence.
- Reusing cached daily composition instead of raw baseline reads could miss A2/manual corrections; rejected.
- Longer TTLs, source slowdowns, disabling collectors, dropping historical data and paid upgrades are not used.
- Existing flights/month/stats cache repairs and composition no-op optimization remain intact; no duplicate work.
- Forecasts/outcomes remain append-only and separate. Missing/stale/error data are never converted to zero or LIVE.
- Protected API locks retain the original protected list and enforcement. The two exact authorized diffs and prior/new hashes are recorded in `approvals/d1-read-efficiency-20261031.json`.

## Validation / release gates

- Local build, rendered HTML 53, TypeScript, lint (0 errors / 23 pre-existing warnings), focused cache/summary 58 and forecast/recovery 95 passed.
- Initial full unit run: 2,573/2,574, one expected protected-byte mismatch. Exact authorized API diffs were then recorded and locks renewed; final full run passed **2,575/2,575**, including explicit cache partial-failure admission.
- No JSX, CSS, public numbers, schedules, migrations, dependency or generated airport-period assets are included. The pre-existing generator drift is being handled separately.
- Browser inventory is 1,981 cases (inventory only, not execution). Final full build/HTML53/TypeScript passed after the admission hardening. Full history secret scan, final exact revision CI/browser gates, normal merge/deploy and live revision verification remain required; do not bypass failing/unknown checks.
- After deployment, compare the same query meta first, then identical UTC observation windows with traffic context. Do not equate a partial day with a complete day or claim all daily quota risk is eliminated.

Pre-release public prediction cache probe: identical URL `/api/live/predictions?area=myeongdong`, same ORD edge, 01:54:15 and 01:55:05 UTC, returned HTTP 200 / 168 records each but distinct generatedAt values (`01:54:15.515Z`, `01:55:05.137Z`) within the advertised 120-second shared window, with no Age/cache-hit header. This confirms two independently generated responses; it is not a numeric account-savings claim. After deployment the same narrow pair should show actual shared reuse.

`npm run health` initially could not create tsx CLI IPC in this container (EPERM); running the same checker with `node --import tsx scripts/health.ts` succeeded. Its system verdict remains UNKNOWN / source census UNMEASURED without production DB, not an operational all-clear.
