# Boarding location and first-load correction

Baseline main: 258799b096db570ffa94da9fc10209e13c5d78e4.

## Evidence and scope

The flight normalizer stores only T1/T2; a null terminal alone cannot prove concourse use. The official airport departure guide (https://www.airport.kr/ap_ko/886/subview.do, checked 2026-09-05) explicitly maps boarding gates 101–132 to the concourse. Presentation therefore resolves only an absent terminal with an exact three-digit gate in that range. Explicit terminal values are preserved. Missing, suffixed or ambiguous gates stay unknown. This is boarding location, not check-in terminal. No canonical rows or historical forecasts are rewritten and no provider recollection is needed.

The Korean shell had globally preferred the 2 MB full Pretendard face despite an existing 236 KB subset of the same font. Restore the small shell face, retaining the full font for provider text that needs wider glyph coverage. Site usage guide uses the same shell family. This is a transfer reduction on the shell, not a promise that provider-heavy pages never need the full face.

Production baseline run 33956722390 confirmed the existing server page preloads the summary already (request starts at 309 ms, beside script loading). Preserve that implementation rather than adding a duplicate link. No new API, TTL increase, stored stale data, localStorage cache or D1 query is introduced.

## Retry verification

Existing low-call data.go.kr policy: at most four attempts, delays 2/10/45 seconds plus bounded jitter. KMA: three attempts per grid; T2 paged congestion: three attempts. Transient exhaustion remains visible and last-good rows keep their original timestamps. Subsequent collection schedules continue automatically; this is not continuous unlimited retry. Daily events/A3 have daily cadence, unlike realtime sources. No schedule or quota change is made here.

## Applicable gates

No architecture migration, schema, indexes, collector writes, provider requests, cron, billing or credentials change. Read path uses the same already-loaded gate fields, one bounded physical-flight pass and the same summary cache admission. Validate exact gate boundaries, duplicate/conflicting IDs, unknown labels, rendering/type safety and one summary request on first load. Compare the existing production mobile timing before/after; do not generalize one run into a universal speed guarantee.

Baseline mobile timing (4x CPU, one run, existing production workflow): data 1700 ms; uncached summary 938 ms; font transfers 2,057,988 + 241,468 bytes. The existing preload is already working. Primary confirmed avoidable transfer is the global full-font preference.

## Passenger scope follow-up

A5 is the existing owner-verified V5.0 departure-hall forecast contract. `t1dgsum1` and `t2dgsum2` are the official terminal aggregates, consumed independently of the A1 flight terminal/gate classification. No concourse field is dropped by our A5 parser; this source has no separate concourse passenger total. The airport's departure procedure (https://www.airport.kr/ap_ko/886/subview.do) places passengers going to concourse gates through T1 departure formalities. From the departure-hall counting basis and that published route, such passengers are within the T1 departure-hall scope. This does not establish an independently verified count of all concourse boarding/transfer passengers. Preserve the provider's totals and add a localized scope note; never estimate or add passengers from concourse flight share.

The initial CI's only failed browser assertion required the former full-font family by name; 115 other browser cases passed. Update that explicit family expectation to the intentional subset choice while retaining weight and glyph checks.
