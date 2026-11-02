# Airport initial-connect handoff — local review, 2026-11-02

## Scope and evidence

Local-only implementation based on origin/main `18c567c6` (fresh clone started at `be5aaae7`; fetched and fast-forwarded after reviewing #563's unrelated airport UI/test changes). No existing branch/worktree was modified. Root AGENTS.md, CLAUDE.md, SHARED_PROJECT_STATE, ENGINEERING_DIRECTION, ZERO_COST_HYBRID_AUDIT and relevant production/data/security/zero-cost/runbook docs were read. This checkout has no `.agents/skills` directory or descendant AGENTS.md in the changed areas. User's local-only restriction supersedes the repository's default push/PR instructions.

Read-only GitHub evidence: https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41393665761

- Primary T1: NETWORK / UND_ERR_CONNECT_TIMEOUT, attempts=4, elapsedMs=99597, providerRequests=4, ERROR, zero writes.
- Primary T2: same classified cause, attempts=3, elapsedMs=66453, ERROR.
- Existing fresh runner: T1 SUCCESS, providerRequests=1, 12 changed rows; T2 SUCCESS, one page, 8 changed rows.
- Latest 24 realtime runs read at 2026-11-02 ~06:13 UTC include three failed run badges (41393665761, 41373465526, 41369495721). Only the first run's detailed logs were independently inspected here. The run badge correctly remains failed after a successful recovery.

This evidence does not establish a network/egress root cause or guarantee that a new runner fixes it.

## Change

Only the primary serialized realtime cycle sets `RPK_A4_STOP_ON_INITIAL_CONNECT_TIMEOUT=true`. The production entrypoint passes it to the A4 policies. T1 and T2 page 1 may stop after their first request **only** when fetch rejects before HTTP headers with NETWORK + UND_ERR_CONNECT_TIMEOUT. The error keeps attempts=1 and retryExhausted=false, because the normal ladder was deliberately not exhausted. It is still ERROR; the unchanged source-specific decision function starts at most the already existing one fresh runner. Later T2 pages retain the original ladder.

No new scheduler, runner job, request loop, secret, paid service, retry source, concurrency group or write path. The existing `production-collector-realtime` lock still wraps primary plus retry. HTTP 5xx, other network causes, client aborts, post-header body failures and later attempts retain existing bounded retries. Authentication/quota/malformed data stay failed; T1 all-counts-missing rechecks retain their shared four-request ceiling. Last-good records and timestamps are not rewritten to pretend success.

## Budget and limits

For a cycle whose very first request has the specific connect failure, T1 changes from up to 4 primary + 1 fallback requests to 1 + 1; T2 page 1 changes from 3 + 1 to 1 + 1. At 96 cycles/day, that path is at most 192 requests/day/source if both primary and fallback always time out. T1 is 19.2% of the documented 1,000/day planning quota; this is a calculated request bound, not official usage. T2 quota remains UNVERIFIED_QUOTA. Mixed failures/later-page ladders retain the older conservative ceilings; this is not a blanket reduction of all possible failure budgets. Healthy primary collection remains one request for each one-page source and no fallback.

Avoided waits include T1's 57 seconds of backoff and three extra connection attempts, T2's 35 seconds of backoff and two extra connection attempts. Actual recovery latency remains unmeasured after this change: provider connect duration, Seoul completion, D1 bookkeeping, GitHub queue and dependency installation still contribute. No runtime timeout was shortened. No claim of guaranteed freshness, free-tier safety or root-cause repair.

## Local verification

- 123/123 targeted tests pass: airport-connect-handoff, airport-t1-recheck, source-reliability, congestion-retry, scheduler-truth, airport-t2-forecast.
- New tests cover both fetch wrappers and actual T1/T2 collectors: one request, ERROR/zero records, unchanged fallback selection; opt-out, DNS/reset/client timeout/HTTP 503, post-header and later-attempt behavior; auth/quota/malformed failures, later-page policy, workflow wiring and redaction.
- Typecheck and scoped ESLint passed.
- Existing full-history secret scanner passed (working tree and reachable history).
- git diff --check performed. No frontend change; build/browser/production source-to-D1 checks not run. Production execution is outside authorization; RUNTIME_ENABLE_STATE_UNKNOWN from local checkout.
- Windows checkout initially caused existing LF-sensitive workflow tests to fail. Workflow working copies were normalized to LF; unrelated files have no semantic changes. One test harness type annotation was corrected before the final passing run.

## Release / rollback

Local commit only. Push, PR creation, merge, deploy and remote collection execution were not attempted and need separate authorization. Before publishing, rebase/review against then-current main, run applicable CI, and verify workflow behavior with authorized observation. Rollback is removing the primary opt-in flag (or reverting the commit); the existing bounded policies remain the default. Production benchmarks and post-change latency evidence are intentionally not claimed.
