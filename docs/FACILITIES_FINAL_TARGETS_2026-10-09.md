# Published facilities and remaining UI targets

The facilities implementation preserves the owner-merged PR326 above actual main `1f2c972c8187ffb790808a520026fd5cdf0334cf`. It is retained in the single combined draft PR327 together with the midnight, consumption and departure-guide follow-up described in `MIDNIGHT_CONSUMPTION_DEPARTURE_2026-10-10.md`. The owner performs final GitHub Merge; this work does not deploy.

## Behavior

- The flight board places the gate-area controls at the right above the existing dark divider, followed by departure/arrival controls and search. Metadata carries the evidenced gate area. Exact existing gate classifications are reused; terminal summaries keep their original denominator. Unknown and concourse records remain available in the full list.
- Remove the business NEXT promotion and its future-feature preview. Existing preparation, industry actions and stored records stay available.
- Move the redundant bottom coordinate toggle inside the retained source/counting-basis disclosure. Official gate coordinates, selected gate flights, three area cards and the other-gates list stay available.
- Seoul pages offer a closed-by-default toilet and locker guide. The toilet list is fetched from a static snapshot only when opened, with search, 10 initial entries, 20 more per request to expand, addresses, posted hours, accessibility information and actual published WGS84 coordinates.
- The airport facilities tab offers official parking guidance. Parking available spaces and locker vacancies are unverified and shown as unavailable, with official source links. No live connection is claimed.

## Sources and boundaries

The [Seoul official OA-22586 dataset](https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do) CSV downloaded on 2026-10-09 contains 4,455 rows. The local import script derives complete district lists: Jung-gu 157, Mapo-gu 183, Seongdong-gu 189 and Yongsan-gu 120. These are labelled district lists, not commercial-area boundaries or nearby rankings. The download date is not a per-row update time. Published hours do not establish current opening. Credit: Seoul Metropolitan Government, public license type 1. The input SHA256 is included in each generated file.

The [official metro locker dataset](https://data.seoul.go.kr/dataList/OA-22731/A/1/datasetView.do) documents a response/header/body envelope. The once-approved request in Actions37941475600 returned HTTP200 and top-level response, with one GET and zero retries/D1 access. Its old parser's zero rows mean unrecognized structure, not zero lockers. A pure, locally tested parser now recognizes that envelope and the older service envelope. STRUCTURE_OK verifies shape only; vacancy semantics, size, coordinates and source freshness remain unverified. No additional GET was performed or scheduled.

The [official airport parking guide](https://www.airport.kr/ap_ko/955/subview.do) remains directly available. The [documented HTTPS provider endpoint](https://www.data.go.kr/data/15095047/openapi.do) matches the previous request, whose result was HTTP403. Existing metadata does not establish the precise rejection cause or actual account service approval. No further request, alternate protocol, bypass, key request or rights expansion.

Monthly stored-data diagnostic37941301323 exited successfully, but both downloaded logs contain no coverage result/counters and the public Actions artifact list is empty. Actual SELECT execution count, rows_read and internal daily coverage remain unverified. Offline execution of the original mapping against an eight-month, fifteen-category synthetic fixture produced a 711,297-byte single JSON line and contained no synthetic financial values. A large line is a possible output problem, not a proven cause. No further SELECT was made; monthly calculations are unchanged.

## Assets and performance

Three actual Blender sources accompany 256px WebP concepts for toilets, lockers and parking. Images total 13,888 bytes, reserve 96x96 display space, load lazily and use the already optimized files directly. They are labelled conceptual facilities, separate from the official coordinates and actual floor plans. No runtime 3D engine, new collector, database migration or recurring schedule.

Identical local comparison: Chromium 390x900, fixture clock, reduced motion, three fresh contexts per route, no network/CPU throttle, development servers4199 and4200. Warm LCP (excluding first sample) was 106 to108ms on Myeongdong and442 to430ms on Airport. CLS was unchanged: 0.2707475103 and0.0016876362 respectively. No overflow. These are local fixture results; a production/mobile PSI improvement is not established. Request-event evidence shows zero toilet data/facility image requests while closed, then one local toilet JSON and two concept images after opening.

## Validation

Local typecheck, scoped ESLint, native production build and diff check passed. New unit cases: 9/9 for snapshot integrity, search, invalid coordinates/duplicates/districts and safe response-envelope handling. Original font coverage tests: 2/2. Original Owner UI Lock/schedule enforcement passed; all61 protected paths and prior approval records remain, with two explicitly approved hash updates.

New browser scope covers four languages and360/390/430/1280px, gate filters/search/unknown/all/terminal/direction switching, empty results, keyboard, reduced motion, actual toilet search/coordinates/pagination, unavailable locker/parking states, glyphs, console and overflow. Separate failure/lazy-fetch and promotion-removal cases passed. Existing affected map/model/position/directory cases were48/53 initially; five failures caused by the new image optimization error were corrected and all five passed. Already passing unrelated suites were not manually repeated. The new image route error was fixed by serving small pre-rendered WebP directly. The local server's public origin was also corrected for console/CSP verification.

The facilities head `be5f97aaa3eb824dc18f32924120f6ce4ea64177` passed CI37952066129. The combined follow-up receives normal new-head CI after its push; the actual result is recorded in PR327. No manual full CI rerun, agent merge or deployment. Live parking/locker source semantics and monthly diagnostic coverage remain unverified.
