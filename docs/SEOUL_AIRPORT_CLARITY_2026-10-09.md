# Seoul glance and airport clarity — 2026-10-09

Draft implementation based on actual `origin/main` `4417c78e144928844aaa1e85f5baad10d1249fa3`. Existing airport C/D model assets, flight/population calculations, forecasts, prediction audit, official gate coordinates, shared install-before-exchange header and scheduler expressions are preserved. No agent merge, deployment or production schema/source activation.

## Implemented scope

- Rename the comparison page and four-language navigation/search to Seoul at a glance. Select now or an actually published, fresh official forecast time; compare four areas only when their source clocks match. Show date-matched official events and published industry payment-count shares, including valid zero values. Missing, stale and suppressed values do not become recommendations or zeros. The page uses the existing shared summary; no new provider calls or 3D engine.
- Keep the travel-records entry independently visible to the right of the closed departure guide. Real Blender suitcase buttons and the existing native selector share one state; selecting baggage changes the immediate guidance and conditional bag-drop plan. Opening records does not create a record.
- Show explicit historical sample count, range and difference for airport comparisons. Equal past extrema print once. Similar-day reasons distinguish equal, close and different values. Keep the first comparison evidence and data calculations; remove the requested duplicate bottom explanation and notices. SVG material faces retain the exact original bar heights, zeros and common axis.
- Restore the isolated airport-history material stylesheet from the retained PR317 source. Preserve widths and data. Monthly population labels state an average of hourly people present, with completed observation days and eligible days. Native region/month controls keep keyboard behavior and use small pre-rendered Blender accents.
- Seoul detail weather uses one KMA forecast card. Independent PM10/PM2.5 observations and their source time remain; old air readings do not enter current preparation guidance. Airport wind/fog observations remain.
- Historical short-stay foreign presence prints its source date/hour. Purpose mobility prints its reference day and describes estimated repeated movements; the shopping-purpose definition is limited to department stores/premium outlets. Quarterly sales remains a quarter's estimated total. Matching-history comparison is explicitly unavailable rather than invented.
- Store priority actions/reasons are readable immediately. Remove only the requested store feeling-record entry and closing-record rows; stored records and review data remain. Tourism show/copy buttons are removed; official event details and links remain. Usage-guide explanations are split into short paragraphs with existing strong-weight tokens.

## Monthly definitions — research before any calculation conversion

`lib/commercial-monthly.ts` groups source `commercialAt` clocks into calendar-day/hour bins. It deduplicates the same source clock/category and uses the latest stored version. Published nonnegative counts include zero; missing/suppressed observations are absent. Matching compares the same day-of-month/hour bin, with equal hourly weights. `matchedHours` is a count of matching bins, not fully observed hours; `matchedDays` is a count of dates, not complete days. Payment-count and amount availability can form different cohorts.

The [official Seoul manual](https://data.seoul.go.kr/SeoulRtd/downloads/%EC%8B%A4%EC%8B%9C%EA%B0%84_%EB%8F%84%EC%8B%9C%EB%8D%B0%EC%9D%B4%ED%84%B0_%EB%A7%A4%EB%89%B4%EC%96%BC.pdf) defines commercial figures as recent 10-minute card activity with publication delay and suppression. The repository attempts collection every 15 minutes; this is different from the source window. The [official dataset](https://data.seoul.go.kr/dataList/OA-22385/A/1/datasetView.do) does not provide an historical API backfill. A partial collection cannot establish a full calendar month's daily payment total by zero filling or scaling.

Four already-public September aggregate responses show first included clocks on September 5 for Myeongdong/Seongsu/Hongdae, and September 28 for Itaewon. Their clock counts were 2,067 / 1,733 / 2,244 / 183. These establish incomplete public monthly coverage. They do **not** prove every raw stored day is incomplete: the per-day internal inventory was not executed. No daily-total conversion, arbitrary completeness threshold, recollection, paid source or calculation change was made.

Population is separate: `lib/monthly-records.ts` chooses the last valid sample in each KST hour, requires all 24 hours, averages lower/upper bounds separately, then averages complete days equally. It is neither a daily accumulated visitor count nor unique visitors. The previous month also uses only stored complete days.

The [official mobility definition](https://data.seoul.go.kr/dataVisual/seoul/capitalRegionLivingMigration.do) describes statistical movements, published monthly for the previous month, with shopping limited to department stores/premium outlets. The existing parser sums the latest daily slice of mapped destination districts, not a monthly visitor average.

## Source checks and blockers

- Parking contract run [37931506439](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/37931506439): one provider request, HTTP 403, zero retries/D1 reads/writes. Existing key presence was verified by name only; service authorization is unconfirmed. No key request or protection bypass.
- Locker contract run [37931548508](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/37931548508): one request, HTTP 200, schema unverified; zero retries/D1 reads/writes. Auto-review rejected a proposed additional read as exceeding the one-read scope. It was not executed.
- [Official public toilet data](https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do): CSV retrieved, 4,455 rows, CP949 encoding. Contains official coordinates/addresses/posted hours, not verified current opening status. Connection/UI work continues in a separate subsequent bundle.
- The proposed `commercial_months` diagnostic is exactly one bounded SELECT of up to eight September/October aggregate rows, with an explicit read ceiling. It would print area/date/category observation-hour-bin counts and duplicate/missing counts only; no payment numeric values, original payload, URLs or keys. Auto-review rejected execution because disclosure of derived data into public Actions logs needed explicit approval. The diagnostic has not run. Read-only code is prepared; the owner decision remains pending.
- Supported Library materialization returned HTTP 403 for supplied reference attachments. Structured text was available, original image pixels were not. The new Blender assets and actual local UI screenshots are inspected separately; this does not claim pixel-perfect matching to unavailable originals.
- The exact original airport-area-filter scope and the requested preview deletion target are still unconfirmed; no guessed replacement was implemented.

## Verification and performance

See the PR body for exact final commit, checks and their scope. Original Owner UI Lock enforcement remains enabled: all 61 paths and cron expressions remain, only seven actually changed protected hashes are refreshed with the scoped owner evidence in `docs/approvals/seoul-airport-clarity-20261009.json`.

The local comparison uses the unchanged base on port4198 and this branch on4199, 390×900 Chromium, fixed fixture clock, reduced motion, three fresh contexts per route, no CPU/network throttle. These are development-server measurements, not public PSI or production-user results. Initial compilation is separated from warm measurements; resource timing is cleared by the environment and its zero count is not a network-request measurement. Public after-deployment performance cannot be claimed before approval/deployment.

| Local route | Before | After |
| --- | --- | --- |
| Seoul at a glance CLS | 0.071685 | 0.036986 |
| Seoul at a glance warm LCP median, first sample excluded on both sides | 110 ms | 130 ms |
| Airport CLS | 0.001676 | 0.001688 |
| Airport LCP median, all three samples | 440 ms | 456 ms |

No horizontal overflow was observed. Seoul layout movement fell about 48%; LCP improvement was not demonstrated. The six new 256px WebP symbols total 25,912 bytes; the browser uses pre-rendered assets without a new 3D runtime.

Local validation: typecheck, lint (zero errors; seven existing warnings), native build, original UI Lock enforcement and secret-pattern scan passed. The complete unit run had 1,291/1,293 passing initially; the two failures were corrected and all 71 affected unit cases passed on scoped retest. The rendered run had 44/46 passing initially; both corrected cases passed on scoped retest. Relevant browser validation covers four languages and 320/360/390/430/1280px, native keyboard controls, reduced motion, repeated date/terminal/time changes, forecast/source failures, stale/zero/missing values, closed-guide travel navigation, baggage state and preservation of existing device records. The affected browser suites plus failed-case retests passed; this is not a claim of a fresh whole-repository E2E run.
