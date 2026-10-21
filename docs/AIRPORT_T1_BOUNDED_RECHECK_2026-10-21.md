# T1 bounded missing-count recheck — local preparation, 2026-10-21

Base fetched and verified: `26474d048885a642550d1196a55586b1b5f9fe60`.
This is an isolated, unpublished preparation. No push, PR, merge, deploy,
provider request, live collector, credential or security change was performed.
PR #413 / the independent UI hotfix is outside this change.

## Why this exception, rather than more schedulers

Supplied incident evidence: T1's 12 returned rows lacked `waitLength` at
07:23/07:53/08:08/08:23 KST on Oct 21. A separate 07:37 connect timeout affected
both terminals, including the existing fresh-runner retry; T2 recovered at
07:53. T1's last supplied good collection was 07:08 with a 07:02 observation.
These observations are inherited investigation evidence, not fresh provider
probes in this task. No raw response was available; there is no evidence that
a renamed count field is the answer. A missing count is never zero.

Before this change, transport retries finished at the JSON parse boundary.
Rows were normalized afterwards, so missing counts could not use any quick
recheck and waited until the next ~15-minute cycle. The generic schema rule
was correct for permanent contract errors but did not offer the user's
requested bounded opportunity to recover this missing-field episode.

## Exact behavior

- Only the T1 collector calls `fetchAirportCongestionJson`. The private payload
  recheck recognizes resultCode `00`, 1–50 rows, `P01`, valid nonempty gate and
  parseable observation time, and absent/null count in **every** row. Existing
  supported `items`/`item` envelopes and field aliases are retained.
- The same four total HTTP attempts cover both transport and missing-count
  failures. Waits remain 2 / 10 / 45 seconds plus ≤500 ms jitter, i.e. quick
  responses are rechecked at roughly +2 / +12 / +57 seconds, not 15 minutes.
  The existing 30-second per-request timeout is unchanged: ≤178.5 seconds for
  four timeouts plus default waits; retryable 5xx cooldowns may extend waits
  to 60 seconds each (absolute policy wait/request bound ≤300 seconds).
- A one-attempt fresh runner remains one request. No new workflow, timed owner,
  concurrency lock, global retry, page limit or `A4_MAX_ATTEMPTS_PER_REQUEST`
  increase. Schema exhaustion never earns another runner.
- No-data, partial rows, other schema errors, malformed JSON, wrong terminal,
  bad gate/time, nonmissing malformed counts and provider error codes do not
  gain retries. Normalization is unchanged. A newly named field is never used
  as a substitute; absent `waitLength` still fails even after all rechecks.
- HTTP 401/403 and provider auth/quota replies stop immediately. HTTP 429 also
  stops without spending another attempt, regardless of Retry-After; this
  preserves the more conservative current code/tests (older prose claimed it
  retried). For retryable HTTP 5xx, numeric/date Retry-After is honored up to
  60 seconds; longer cooldowns defer, never shorten. The existing limitation
  remains: there is no persisted cross-scheduled-run cooldown ledger.
- Exhaustion reports `SCHEMA`, `T1_WAIT_LENGTH_UNREPORTED`, real attempts and
  elapsed time, `retryExhausted=true`, `schemaField=waitLength:missing`. No raw
  payload/value/URL enters diagnostics. T1 counts every fetch in
  `providerRequests`, including successful recoveries after earlier failures.
- Invalid attempts perform no canonical writes. Last-good rows and timestamps
  are preserved on failure. Only actual later provider timestamps are stored;
  no historical gap filling. Existing observation uniqueness/idempotency remains.

## Quota evidence and limits

[Official dataset 15148225](https://www.data.go.kr/data/15148225/openapi.do)
was re-read on 2026-10-21. It lists free use, real-time updates and development
traffic allowance 1,000; operating allowance increases require application.
Its description provides current/latest observations, not historical lookup.

Nominal 96 scheduled cycles/day: healthy 96 requests; persistent missing-count
responses up to 384; transport plus existing one-request fresh runner up to
480. The previous theoretical ceiling was already 480. **Internal estimate**:
48% of the published development allowance, below the project's 70% NOTICE
planning line. This is not official account usage, not a guaranteed daily
rolling limiter, and excludes manual/other clients using the same approval.
A delayed/queued cycle can cross a day boundary. Actual account usage remains
UNKNOWN. T2's separate unverified allowance is not used to justify any increase;
T2, Seoul and all other providers are unchanged. No extra D1/Worker/scheduler
invocations are introduced. Canonical writes happen only once after a valid
response; retry attempts add no stored raw snapshots or per-attempt health rows.

## Applicable pessimistic gate evidence

| Gate(s) | Result / evidence |
| --- | --- |
| 1 | Fetched main matches supplied base; isolated detached worktree |
| 2–3, 7–8 | Existing Actions collector / trigger-only Worker / serialized cycle unchanged; scheduler/hybrid tests required |
| 4–6 | Worker serving/CPU path unchanged; no new production benchmark claimed |
| 9 | Official allowance reverified; same nominal 480 ceiling; actual usage UNKNOWN |
| 10–17, 25 | No D1 schema/retention change; failed rechecks add no canonical writes; local SQLite preservation/idempotency tests |
| 18–20 | Predictions/outcomes/backfills untouched |
| 21–23 | Original timestamps, real later observations, fail-closed missing counts, shared retry cap, auth/429 and cooldown fixtures |
| 24 | Fixed-token diagnostics; redaction fixtures + secret scan required |
| 26–28 | Estimates labeled; no paid service, fallback or guardrail alteration |
| 29 | No migration; revert the T1 wrapper wiring to restore prior behavior |
| 30 | Local fixture→collector→SQLite tests only. Live provider/D1/API/UI recovery UNVERIFIED; no authorization for live probe |

This is not “30-pass production-safe.” It cannot eliminate provider outages,
repair a persistent schema omission, or reconstruct observations never supplied.
Review/publish/merge/deploy and natural-run proof remain separate authorized steps.

## Validation record

- `npm run test:unit`: **1,852/1,852 passed**, 118.3 s. Test output included
  Wrangler log-directory warnings; all test assertions passed.
- Focused source/collector/error/retry suite: **152/152 passed**; additional
  T1+SQLite suite **84/84 passed**. These overlap the aggregate suite above.
- Scheduler/hybrid/operational fixture gates: **98/98 passed**.
- Independent read-only reviewer: no blocking defect; new T1 suite **42/42**.
- `npm run typecheck`: **passed**. `git diff --check`: **passed**.
- Full eslint was killed by the executor; its memory-bounded broad retry was
  canceled at the integration owner's request to hand off without duplicating
  root CI. Focused changed-file eslint result is recorded below.
- Full build did not complete (exit 137 / killed during client build). No
  rendered/E2E or production/deployment success is claimed.
- Full working-tree/history secret scan was canceled for root CI to perform;
  no full-history pass is claimed. Scoped working-tree result is recorded below.
- `npm run health`: **blocked**, `listen EPERM` for `/tmp/tsx-1000/18.pipe`.
  No permission bypass was attempted. The separate 98 fixture gates above
  passed; they are not a live health verification.

The integration owner requested a local commit only. Root CI must complete
remaining broad checks before any separately authorized publication/merge/deploy.

- Bounded changed-file eslint (`timeout 60s`, 1 GiB Node heap): **passed** for
  both changed source modules and both test files.
- Working-tree-only high-confidence secret patterns (same patterns as the repo
  scanner, excluding its own pattern table and package lock): **passed**.
