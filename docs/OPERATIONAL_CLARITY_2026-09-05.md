# Operational clarity — owner-requested fixes 1–7

Starting main: `2dceebab3a39b9b630b05a613f49b7be0675f2be`.
Scope: presentation truth, exact partitioning of already-read flight rows, and bounded forecast coverage/scorecard. No new provider, scheduler, migration, paid service or store-sales prediction.

1. Terminal `nextBand` now starts strictly after the summary clock; the running band is not next. Remaining totals retain full-hour semantics and show their actual start/end window, without prorating invented minute-level passengers.
2. The full physical-flight set is partitioned into T1, T2, other provider labels, canonical T1/T2-unclassified and conflicting labels. The existing normalizer accepts P01/T1/1 and P03/T2/2; other original labels normalize to null, so null does NOT prove the provider omitted the label. Unclassified rows are never inferred as concourse/T1/T2 from gate numbers. A capped query is explicit. Existing stored terminal mappings are untouched.
3. Terminal details and repeated metric cards are collapsed together; the first brief retains core values, comparisons and collection times. All detail remains keyboard-accessible.
4. Existing hourly Actions coverage includes same-weekday/hour input readiness (minute 00–14, valid live population, compatible source definitions). This is not accuracy. The public scorecard covers the already-bounded latest 7 days, showing matched hours/dates and mean absolute difference only. Valid population outcomes are filtered by source/unit; predictions remain immutable and outcomes separate. Missing results remain pending. No baseline-superiority claim.
5. The optional category parser now accepts the same compact `YYYYMMDD HHmm` format as the existing commercial collector. Missing source times are explicitly unavailable; weather time is not substituted for card observation time.
6. Settings shows failed source names, safe reason categories, preserved last success, and nominal existing next windows. KASI runs with airport_recent (06:07 daily + 10:07 recovery); A3/TourAPI run at 06:07 daily. These are scheduled windows, not execution/recovery guarantees. No endpoint/key/raw failure detail is rendered.
7. Displayed source catalog contains implemented sources only, Korean-first localized names, separate T1/T2 queue sources, and limited real uses. Unconnected NAVER/ECOS/arrival-hall candidates are no longer presented as sources in use. Full source list remains at the bottom.

## Diagnosis boundary
Previous Production Smoke 33953695726: A3 scheduled departures and TourAPI had NETWORK / UND_ERR_CONNECT_TIMEOUT after four attempts. KASI first activation 33953636610 had TIMEOUT after two attempts / 16252ms. These prove failed connection/response, not authentication failure or provider-side fault. A3 is scheduled departure enrichment for duty-free operations, not retail sales. Core A1 flights, A5 forecasts and Seoul/KMA remain separate. Recheck current Source Health after deployment; do not invent root cause or retry unrelated providers.

## Applicable engineering gate
- No architectural change or duplicate cron: PASS by scoped diff.
- Worker: same summary queries, O(n) partition of <=2000 already-read rows; prediction records remain <=168, no external request from page API.
- Actions: existing hourly coverage query extended with bounded per-day eligible hour/version aggregation; no extra source calls. Current coverage rows can refresh once after deployment to add readiness, then retain existing 50-minute skip.
- Storage: same three coverage rows updated, no new table/index/raw archive, no prediction mutations.
- Secret-safe source UI: reason enum only. Authentication/schema errors remain distinct from transient failures.
- CPU/free-tier capacity: NOT newly benchmarked; no capacity claim.
- Quota and retention: existing schedules and retention unchanged.
- Focused checks: time boundary/physical deduplication/unknown terminals/readiness versions/scorecard leakage/compact timestamp/nominal schedules tested.
- Required CI and Production checks: results recorded in PR after execution.
