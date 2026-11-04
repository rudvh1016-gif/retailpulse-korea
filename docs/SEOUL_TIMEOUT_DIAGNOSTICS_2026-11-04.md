# Seoul timeout diagnostics and last-good regression

Baseline: `9a1e2fd122c62c8b8868a099d62ce305202b77e8`.

## Evidence and uncertainty

Realtime runs [41765141032](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41765141032)
and [41799024644](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41799024644)
exhausted two 8-second attempts for each of the four Seoul areas. Airport T1/T2
succeeded in those runs. The next normal cycle after the latter incident,
[41800967625](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41800967625),
collected all four Seoul areas successfully. This does not establish a provider
outage or a runner connectivity cause. The client abort can precede a connection
error, and the old error detail did not distinguish receiving headers from
waiting for them.

## Additive diagnostics only

Seoul opts into `responsePhase=BEFORE_HEADERS|BODY` and `timeoutMs=8000` on
TIMEOUT/NETWORK failures. These describe the final failed attempt, not every
attempt. BEFORE_HEADERS is not proof of a failed TCP connection: a connected
server can also delay its response headers. BODY means headers arrived but the
response body did not complete. Only fixed tokens and a bounded numeric budget
are added; URLs, keys, body text and raw error messages are never included.
Other callers retain their existing diagnostic format. Failure class, retry
eligibility and exit status remain unchanged.

No scheduler, timeout, retry count, delay, provider endpoint, source activation,
D1 schema, canonical data, timestamp semantics or public freshness threshold is
changed. Four normal/eight maximum Seoul requests per cycle remain the bound.
No new provider probes are needed. No new paid service or runtime dependency.

## Regression coverage

- Real AbortController expirations before headers and during body transfer,
  with the same two-attempt ceiling and secret-redaction checks.
- Non-opted-in callers retain their diagnostic format.
- Seed all four Seoul areas from fixture responses, exhaust two attempts per
  area, and assert zero canonical changes, unchanged rows and last-good
  timestamps, STALE health, then normal-cycle recovery to LIVE.
- The recovery fixture deliberately repeats the same semantic values, proving
  that retries do not manufacture history or rewrite retrieval timestamps.

Verification commands and actual outcomes belong in the PR record. These tests
use local fixtures, not authenticated provider requests or production D1.
The rollout must use the existing CI/deployment gates. Observe later ordinary
failures for phase evidence; do not induce a production failure to prove logging.
Rollback is reverting this diagnostics/test change, with no data migration.
