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
