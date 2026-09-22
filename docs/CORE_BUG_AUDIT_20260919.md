# Core collection bug audit — 2026-09-19

Baseline: `caafef95168bcedf499ce6d69a7a11c9a4235436` (PR #200).
Scope: existing collection reliability and truthful operational accounting.

## Evidence and corrections

- Live health at `2026-09-19T13:28:53.480Z` returned app/database `ok`.
  Seoul population/commercial data, passenger forecasts and weather were LIVE;
  the congestion pair and several daily sources reported ERROR. This is a
  partial source outage, not evidence that every feature is healthy.
- Realtime run `35445551064`: both A4 sources exhausted connection attempts
  with `UND_ERR_CONNECT_TIMEOUT`; Seoul succeeded. The one fresh-runner retry
  also failed. No increased cadence, extra runner or provider request is added.
- Weather recovery run `35440735822`, job `105890949179`: each of three grids
  exhausted three attempts, but the result recorded only three requests.
  W1 now counts each fetch attempt, including retries and failed connections.
- Local A5 reproduction: two failed HTTP attempts were recorded as zero
  provider requests. A5 now counts attempts before fetch, while separately
  counting received JSON responses for its existing structural-row allowance.
  Retries cannot excuse additional malformed forecast rows. Failure detail now
  retains the safe failure class, cause, attempts and exhaustion state.
- Local body-stream tests reproduced a second defect: an interrupted response
  body was classified as malformed JSON, preventing the existing retry ladder.
  Body abort/network errors now retain their transport classification; actual
  JSON syntax errors still fail immediately. Production logs do not establish
  how often this specific body-stage defect occurred.

## Boundaries and verification

- The existing source attempt ceilings, scheduler ownership, source scopes,
  immutable forecasts and last-good preservation are unchanged. Body-stage
  retries can now use the already-budgeted ceiling; this is not a claim that
  every run makes exactly the same number of requests as before.
- Counts are application-observed attempts, not the provider's official bill
  or quota usage. Historical undercounts are not rewritten or backfilled.
- Baseline unit tests: 901 passed. Updated unit tests: 907 passed, including
  six new regressions for body transfer and request accounting. Typecheck,
  lint, build and working-tree/reachable-history secret scan passed locally.
- Local browser installation was blocked by the download environment. Browser
  verification remains subject to the existing GitHub CI gate; do not infer
  browser success from the unit/build results.

## Remaining work

- Verify this revision through existing PR CI, current-main deployment and
  subsequent natural collection runs. Do not manually replay collectors merely
  to obtain a green badge or expose production credentials in this workspace.
- Shared-provider connection failures remain an observed external dependency
  problem. These fixes improve bounded recovery/accounting; they do not prove
  that the gateway is reachable from every GitHub runner.
- Keep UI-trial changes #201 and #202 deferred until the documented review
  after 2026-09-26. This patch changes no UI, analytics, data source or schedule.
- Runtime quota utilisation, actual user value and forecast accuracy require
  their own evidence. Neither passing CI nor an HTTP 200 establishes them.

## Post-deployment defect discovered during closure

PR #203 merged as `a218824be6d5e7c672e51574bb76baae07acd4af`.
CI passed 907 unit tests, 42 rendered checks and 239 browser checks. Deployment
`35447247326` succeeded (Worker version `0080235a-1f83-42b7-9be7-5c2421a1bf39`),
and the public health, summary, airport and four language homes returned 200.
The post-deployment discoverability workflow also succeeded.

However, its optional operational-record step failed with
`invalid_operational_identity`; the following ledger re-read and health report
were consequently skipped. Deployment success did not prove ledger success.

The real `saveMeasurement` path passed an entire stored `Incident` as the four
fingerprint parts of a HEALTHY event. Identity validation consequently examined
evidence arrays, counters and nullable dates. A SQLite regression reproduced
the identical production stack when a previously failed source became fully
verified. The caller now passes exactly source, failure class, contract version
and logical job. Identity validation and the three-layer verification gate are
unchanged. The regression also checks that unverified publication stays OPEN
and a repeated healthy observation creates only one resolution event.
