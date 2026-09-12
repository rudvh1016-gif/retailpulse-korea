# KORETAIL UI first release — 2026-09-12

## Implemented

- White-first public home leads with the selected district, official crowding status, estimated population bounds, valid comparison or explicit unavailability, and shared range chart. Three compact area selectors, at most three evidence-backed changes, existing airport overview, weather/events and detail links follow.
- Existing role/location/interests/day/terminal/consent/storage/feedback remain available below the public summary. A collapsed briefing neither mounts nor counts as viewed.
- Area detail uses the same card. Observations are solid; official forecasts are dashed. Both bounds are retained, gaps are broken, isolated points remain points, dates/times are KST, and the actual client clock controls the current-time marker. Native keyboard/touch slider, textual summary and exact-value table accompany the SVG.
- Airport overview leads with the complete day's official expected departure-hall passengers, current band, and largest future available band. Transfer arithmetic stays a smaller reference with components and non-deduplication warning. Queue observations remain separate; observations older than 20 minutes are labelled previous.
- Partial departure/arrival timelines show only available bands and explicit coverage limits; no whole-day total/peak is inferred. Existing T1/T2/all, concourse, flights, facilities and arrival access remain.
- Date, language, terminal, area and browser-back state remain consistent. 7DAYS explicitly means the existing last-seven-day comparison record, not a seven-day forecast.
- Existing KO/EN/SC/JP font families and weights remain. Pinned OFL subsets retain all previous glyphs and add current copy; no external font request or package was added.

## Observed source limitations

Public summary captured at `2026-09-12T08:40:52.421Z`:

- Seoul: Myeongdong 86,000–88,000; Hongdae 96,000–98,000; Seongsu 38,000–40,000; observed 17:10 KST. No usable 7/28-day population comparisons and no continuous observed series in this response.
- Official hourly population forecasts cover 18:00 September 12 through 05:00 September 13, issued at 17:10. The UI shows this actual horizon; it does not create a full tomorrow/7-day forecast.
- Airport: complete 24-band official departure forecast 92,561 (T1 51,005; T2 41,556). Transfer forecast 11,021 produces the existing arithmetic reference 103,582; this is not an official deduplicated total.
- These recorded public values are local visual evidence only. No test payload or example numbers were added to Production.

## Verification evidence

- Actual public before screens inspected separately. Local before/after home, Hongdae and airport rendered at 390 and 1440 pixels using the same recorded public response and its fixed capture time (six views each). Four languages checked at 360 pixels; existing broader typography/interaction tests also exercised 320–1920 pixels.
- Related helper/truth unit tests: 38 passed. Earlier full unit run: 702 passed, 3 obsolete source-location assertions subsequently updated and passed. Final full unit gate runs in PR CI.
- Related UI/typography/personalization run: 133 passed, 13 findings. The nine UI/routing findings plus the new date/terminal navigation case passed targeted recheck (10/10). Missing CJK glyphs were refreshed from verified existing sources; all eight relevant four-language glyph checks passed. Final recorded-response screenshots passed 6/6.
- Final lint/typecheck/build passed; rendered HTML 42/42. Secret scan passed. `health.ts` completed via `node --import tsx` because the local tsx CLI IPC pipe was blocked. Existing operational UNKNOWN findings remain UNKNOWN; runtime LLM scan found zero calls.
- Local Chromium 153 was used through the repository Playwright tests with a scratch-only executable configuration; no repository dependency change. WebKit installation failed in this environment and was not run. CI uses the repository's normal pinned browser installation.
- Client JS/CSS totals: 813,779 → 843,970 bytes; gzip 253,539 → 262,933 (+9,394). The five refreshed font assets total 1,342,684 → 1,187,484 bytes (−155,200). The full upstream Pretendard file is unchanged.
- Summary requests for each recorded home/Hongdae/airport screen: 1 before, 1 after. No new endpoint, poller, collector, schema, schedule, paid API or runtime AI dependency. No horizontal clipping in the checked screens. CLS was not instrumented; loaded layouts were visually inspected and existing loading space retained.

## Release and evaluation

Stages A/B/C were committed independently on `feat/premium-demand-ui-20260912`, based on main `2f5eff8868824e918c23d22ebe0f00abf1549b72`. Stage D contains review fixes and release validation. Deployment is pending at the time this document is committed. Merge only the exact validated PR head after required CI; use the existing protected automatic Production chain and visual check, with its recovery bookmark and migration gate intact.

For the existing two-week trial, use only existing consent-based analytics and feedback: whether users understand status/comparison/outlook, open district detail, return, and report actual work use. No user-demand result or adoption metric is claimed by these tests. No new tracking is installed.
