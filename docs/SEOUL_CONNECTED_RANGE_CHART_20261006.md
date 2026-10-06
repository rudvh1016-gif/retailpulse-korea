# Seoul connected population ranges — 2026-10-06

The owner approved applying the final blue Seoul chart to the real app. The shared
`PopulationFlow` now renders that chart on Seoul area/history and official outlook
screens. It reads the existing live summary; the offline design snapshot is not
included in application code or public assets.

## Data and presentation contract

- Every plotted observation and forecast retains its original timestamp, minimum
  and maximum. Boundaries are straight sample-to-sample lines, not midpoint values,
  smoothed estimates or additional observations.
- The existing collector runs about every 15 minutes. Adjacent observations up to
  30 minutes apart can connect. A longer interval, an explicit `gapBefore`, an
  invalid range in the input, a source/schema change or a KST day boundary breaks
  the observation segment. Forecast segments require consecutive hourly targets
  from the same issue, and never bridge to observations.
- The summary has no complete outage ledger. An unreported outage within a shorter
  interval cannot be inferred from these samples; connected boundaries must not be
  described as continuous measurements. The disclosure explains sampled lines.
- The source's zero range stays zero; missing data stays unavailable. The figure
  has exact values in a native disclosure/table, and retains issue-time provenance.
- Observed bounds are solid `#6494b3` at 0.35px. Forecast bounds use the same color
  at 0.5px with a 3/2 dash. Existing fonts and size tokens remain; chart text is black.
- The data-free material profile is rendered offline with Blender 5.2.1 LTS using
  the approved blue and studio lighting. Runtime SVG strips follow only source
  min/max silhouettes, with opacity 0.58. There is no projected depth outside the
  numeric band. `scripts/render-population-range-material.py` reproduces the PNG
  and profile; neither contains population values or timestamps.
- Full/upcoming views, native time selection, previous/next buttons and chart
  pointer selection share actual source timestamps. Selecting a new view preserves
  a visible selection or falls back to its available data.

## Protection and scope

Started at `28390c5794f9f753025487e1ecf9ff60c64de5c4`, then incorporated main
`6ff277b9d0b227b00f6606c80209c28ada7d83e7` without conflict. Only the approved
`app/area-demand-card.tsx` baseline is refreshed. The extracted
`app/population-flow.tsx` is added to the same active byte-lock assertion. All old
protected entries, prior approval records and schedule locks remain enforced.

No APIs, collectors, forecasts, stored data, schedules, dependencies or paid runtime
services are changed. The forecast-only summary card and airport features retain
their existing implementation. The applicable zero-cost audit is a UI-only delta:
no extra provider/API call, D1 query/write or runtime model use is introduced.

## Verification record

- Full unit/contract suite: 1,154 passed, including the original protection test.
- Lint: no errors; seven existing image warnings. Typecheck: passed.
- Production build and rendered HTML: passed, 42 HTML tests.
- Secret scan: passed across the working tree and reachable Git history.
- Operational health harness: PASS; system state remains UNKNOWN without live
  production database/collector-variable evidence. Runtime model calls: zero.
- Focused Seoul/mobile/major-screen browser regressions: 52 passed. Covers
  320/390/430px and desktop, four languages, exact bands, zero/missing distinctions,
  issue time, midnight, native keyboard focus/selection, and no horizontal overflow.
- Saved public snapshot verification in the actual app: six mobile whole/upcoming
  renders, 22 observed and 12 forecast rows; both source bounds and timestamps match
  SVG coordinates. This is snapshot-based browser evidence, not public deployment.
- Full E2E completion and final remote CI SHA are recorded in the PR. A local run
  initially used the wrong server origin and hit icon CSP errors. It was stopped;
  successful test evidence was reused, and only failed/unrun cases were resumed
  after correcting the local origin. No assertion was removed or suppressed.

At the reviewed main, production dependency audit reported `source-map-js` high
and `baseline-browser-mapping` moderate. The lead owns that separate remediation;
this branch does not duplicate it. Merge and public deployment are coordinated by
the lead and require the applicable final-SHA checks. See the PR for current status.
