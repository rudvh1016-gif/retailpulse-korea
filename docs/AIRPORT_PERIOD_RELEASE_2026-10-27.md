# Airport period comparison and usage guide — 2026-10-27

The owner approved applying the reviewed comparison to the existing live site, refreshing the notice and More guide, and deployment after verification. This supersedes the earlier local-preview-only restriction. Existing non-Korean screens are retained; the new comparison controls and revised guide are Korean.

## Delivered behavior

- The existing airport glance remains the first tab. Four adjacent tabs compare hourly distribution, weekdays, terminals and destination-country holiday periods
- All new analyses accept two independent start/end ranges. Daily means use each range's actual complete days; missing days do not become zero. Exact coverage, exclusions and source numbers remain available
- Hourly chart retains stacked terminal bars and two lines: gray dashed baseline, navy comparison, white dash casing for coincident lines, plus separate-line mode
- Weekdays use paired columns, terminal comparison uses short paired bars, holiday comparison uses two columns with flight units. Four time-band matrices align baseline/comparison headings and values
- Whole-number presentation rounds absolute magnitude half up; calculations retain raw precision. Nonzero changes smaller than the printed resolution show a directional less-than-one bound. Sitewide decline presentation changes from filled triangle to owner-requested hollow △; increases retain +
- Country flow separates official monthly departing passengers (whole airport) from scheduled flights. Flight views separate arbitrary dates for the 12 archived airport-wide destinations from existing terminal/month aggregates
- More explains concrete uses for airport store staff, managers and customer-facing staff, with 13px body and 18px section title. The current notice links to actual new controls; the old experimental preview keeps its own navigation

## Data and cost boundaries

No collector, schedule, schema, quota or production database write is added. Analysis reads the existing `/api/live/airport-days` endpoint only after opening an analysis tab; that endpoint reads a bounded rolling 63-day archive. Terminal/month comparison reuses the existing monthly endpoint and shared retry/retention hook. Initial overview does not mount an analysis iframe. No saved prototype records or embedded font binaries ship in the new assets. Browser cache versions are content-derived. The parent/child message bridge validates origin and source.

Historical time distribution is scheduled departure activity, not store visits or actual passenger counts. Route country is destination, not nationality. Different periods can have different weekday/holiday composition. Changes around holidays or terminal moves do not establish causation. These views support situational review; they do not establish sales lift, staffing quantities or inventory needs. No field study has validated sales outcomes.

## Verification record

Local checks and final exact-head CI/deployment results are recorded in the linked release PR. Added 36 arithmetic/coverage tests and integration cases for 360/390/430/1440px, lazy loading, two unequal ranges, holiday units, country handoff, retry and More typography. Existing sign, notice and heading expectations are updated to the owner-approved contract, without weakening coverage.

The approved lock fixture updates the three intentionally changed UI files: `app/globals.css` (guide sizes), `app/retailpulse-app.tsx` (reading-rule symbol), and `app/site-usage-guide.tsx` (guide copy). `public/_headers` adds an exact-path policy for the public analysis document: same-origin framing only, no external script/connect hosts, and no indexing. `next.config.ts` applies the same document policy to the application server; ordinary pages retain DENY. Rendered-response tests cover both paths and the unchanged page protection. All scheduler and other protected-file checks remain active.

Windows local source tests require LF checkout text for Linux-oriented byte/regex checks. Historical evidence files were restored byte-for-byte after that local normalization. A read-only loopback component harness uses saved public responses for visual inspection; it is not deployed or represented as current live data. Production acceptance requires successful CI and a post-deployment check against the current public API.
