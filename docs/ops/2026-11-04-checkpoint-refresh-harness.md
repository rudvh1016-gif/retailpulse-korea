# Checkpoint summary recovery, 2026-11-04

## Evidence and scope

The reported screen showed a T2 observation at 10:37 KST marked stale at 11:01 KST. This does not establish the exact cause of that browser's delay. The existing realtime workflow run 41757015450 successfully collected T1/T2 at 10:53 KST, and a later public summary returned current T1/T2 observations. No collector is added or redispatched by this change.

A deterministic reproduction established a separate recovery gap: an HTTP 200 body with malformed `sources` could throw in refresh policy after the fetch catch, retain the rejected shared pending promise, and leave the hook's in-flight guard set. Browser stale-while-revalidate responses could also receive a fresh five-minute timer regardless of their age.

## Recovery harness

- Validate the summary shape, date identity and timestamp before accepting it. Invalid responses are failures, not fabricated data.
- One pending request per date/month. Every settlement clears the slot; the hook resets its in-flight guard in `finally`.
- Use the existing stored JSON reader's 15-second deadline covering both headers and body.
- Consecutive failed reads retry after 60, 120, 240, then at most 300 seconds. Successful reads reset the count. No immediate retry loop.
- Preserve last-good values and original source/observation clocks on failure. Older responses cannot replace known newer data. A future cached clock cannot pin recovery forever.
- Count the age of the response toward its next read and shorten reads near the checkpoint's existing 20-minute freshness boundary. Stale/failed checkpoints recheck within two minutes, subject to the bounded failure backoff.
- Hide/pause the page without polling. Visibility, online and pageshow events use the same pending request and cooldown. Date switches and KST midnight keep their existing isolation.
- Preserve initial summary preloading. Later reads use browser `no-cache`, a stable URL and the existing shared edge-cache TTL. The gateway strips browser revalidation headers before the shared cache, avoiding cache-busting D1 reads.

## Truth, cost and rollback

No source value, provider status, stale threshold, server response TTL, collector, schedule, SQL, migration, permission or paid service changes. This does not attest account-wide free-tier usage. Browser reads remain bounded and continue through the existing cached read API. Existing trigger-only Worker Cron and serialized GitHub realtime collection/retry remain authoritative. The unrelated monthly comparison recovery is unchanged.

Rollback is a normal revert of this isolated change after the usual CI gates; no database rollback is required. Protected UI and scheduler locks retain their canonical hashes and reverse only five exact approved reader hunks.

## Verification

Pure policy tests and a VM harness run the actual summary loader for malformed success, synchronous/body rejection, concurrent callers, last-good clocks, bounded backoff/reset, same URL/cache modes, wrong date/midnight, future-clock recovery and genuinely older-response rejection. Browser regression tests exercise a malformed-success failure sequence and stale-to-current checkpoint recovery without reload.

Initial local verification passed 2,803 unit tests, typecheck, lint (zero errors, 24 existing warnings), build, 53 rendered HTML checks, secret scan, scheduler health and dependency audit (zero high/critical). Local Chromium launch was blocked by executor socket restrictions, so it is not claimed as a browser pass. After workspace restoration, the runtime code and browser tests were recovered from their exact compiler source maps; the harness, cache regression and protected-hunk registration were rebuilt and were revalidated: 2,804 unit tests passed; typecheck, lint (zero errors), and build passed. Exact remote CI, merge and deployment evidence will be recorded on the pull request. Deployment requires the mandatory full GitHub browser suite to pass for the release commit.
