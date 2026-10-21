# Matched airport frontend lab: attribution, not an improvement claim

Baseline inspected: `26474d048885a642550d1196a55586b1b5f9fe60`.

The first release's matched frontend lab passed its existing budget but mobile
LCP increased from 5,608 to 6,912ms and FCP from 5,608 to 6,204ms. Observed
non-input layout-shift sum rose from .027574 to .094324. The LCP element changed
from `IMG` to `SMALL.focus-event-row`, so this is not identical-content timing.
Captured October 19 API fixtures do not measure live backend or real-user speed.

The existing budget checks only shift sum <= .1, FCP <= before × 1.1 + 100ms,
and transfer <= before × 1.05. **It does not gate LCP.** This patch leaves all
checks, metric semantics, fixtures, run count and throttle settings unchanged.

The artifacts lacked shift sources and resource timing. Two different briefing
components emit `SMALL.focus-event-row`, so increasing a CSS min-height without
attribution could change approved whitespace without fixing the actual cause.
The current font already uses `font-display: swap`; font blocking is unproven.

## Added evidence

- Up to 20 LCP candidates, with paint/load times, size and bounded structural
  paths. A maximum 100-character excerpt is allowed only inside the
  fixture-backed public `.focus-report`, excluding form/editable content.
- Up to 40 non-input shifts with timestamps and up to five source paths and
  previous/current rectangles per shift; dropped entries are counted.
- Up to 160 resource timing rows, plus navigation timing. Existing byte totals
  still account for every resource. URLs omit query, fragment and credentials.
- No cookies, storage, input values, arbitrary attributes or layout reads.

This is lab-only instrumentation, not production telemetry. No UI, data,
collector, dependency, provider, runtime or budget change is included.

## Verification boundary

Unit tests exercise serialized browser functions, privacy restrictions, caps,
non-input filtering, retained cumulative metrics and unchanged byte totals.
The browser was not rerun locally after the existing environment IPC denial.
Matched CI artifacts must identify the actual shift and critical-path sources
before a bounded UI fix or speed-improvement claim. Root coordinates publication,
deployment and live verification.

Local checks: `node --test tests/airport-lab-observers.test.mjs
tests/airport-performance-budget.test.mjs` passed 6/6; both changed script
`node --check` commands and targeted ESLint passed. A duplicate full-history
`npm run secret:scan` was interrupted (not a pass); the existing repository's
five credential patterns are instead checked against these four changed files.
Full-history scanning remains a GitHub CI gate on the integrated commit.

## 2026-10-21 matched-notice correction — PR #414

- Candidate `62bd5396cefa430be5176da710b0500ab46d3d38`, tested merge
  `a911b968b15efb73832e89f8de80093e741e9136`, tree
  `fe782dd0c8bfda81df0780fb2ad889677bf5b356`.
- [CI 39525199567](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39525199567),
  performance job `118978081963`, artifact `12313001119`, reported budget success.
  Attribution exposed a comparison defect: the baseline LCP came from
  `dialog.update-notice`, while the candidate LCP came from the airport briefing.
- The candidate harness seeded only `airport-flow-20261021-v1`; baseline main
  `6a502845185ca8de33aa9c2b34764d33f335cd40` still used
  `airport-comparison-20261019-v1`. Thus the baseline notice opened and the
  candidate notice remained dismissed. The older PR #414 run `39520783242`
  used the same mismatched seeding. **Do not use either run's before/after
  figures to claim a speed or CLS improvement.** Absolute candidate observations
  remain diagnostic, but those comparisons are not matched UI conditions.
- Fix only the lab: the BEFORE command imports the notice-state helper from its
  own `.benchmark-main` checkout; AFTER uses its own current helper. Missing
  helpers fail instead of silently falling back. The measured report records
  `noticeOpen`, and validity requires it to be exactly `false`.
- Production UI, notice preferences, fonts, data, timing method, resource
  accounting and the CLS 0.1 budget are unchanged. No fixed-height guess or
  font-preload experiment was added.
- Local checks: 12 lab/notice/analytics/budget tests pass; scoped ESLint and
  diff checks pass. A corrected matched CI run is required before interpreting
  relative performance. Full release verification remains separate.
