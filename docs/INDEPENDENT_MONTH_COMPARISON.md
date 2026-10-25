# Independent stored-month passenger comparison

Scope: the route-country official monthly passenger table only. The latest-month TOP3 summary remains independent. Existing counters, authentication, calendar data and collection schedule are unchanged.

## Contract
- Two labelled selectors choose baseline and comparison months independently. Only 2026 month keys returned from the existing stored route statistics are enabled; unavailable selections are never silently replaced.
- Exact endpoint `/api/live/airport-passenger-comparison?selected=YYYY-MM&baseline=YYYY-MM` reads at most two compact payloads and twelve explicit 2026 catalog month keys, independent of the selected pair’s year. GET never calls the provider or collector. No raw archive enters the browser bundle.
- Original monthly totals and flags remain. Daily mean = that month's departure total / that month's calendar days, including leap February. People/day displays use rounded integers only; calculations retain full precision. Signed change = (comparison daily mean - baseline daily mean) / baseline daily mean. Zero baseline and missing counts yield unknown, not invented percentages. This is labelled daily-mean change, never arbitrary “previous-month change”.
- Missing month/country stays null (`?`); API failure stays UNAVAILABLE. Same-key last-good values may remain after refresh failure, with an explicit warning. Data from another pair is not reused.
- Stored timestamps and response-count completeness evidence remain inside the existing closed explanation. A missing provider totalCount is not rejected or asserted complete. Known incomplete/contract-drift responses remain rejected by the existing collector.

## Refresh and collection
- Browser reads expire five minutes after request start, so response latency cannot make the first five-minute polling tick reuse a nearly expired value; visible pages recheck on timer/focus/visibility. Concurrent reads coalesce; cache capacity is 24 keys, with failure cooldown and same-key last-good retention.
- The existing public latest-month endpoint now has five-minute shared cache lifetime. The exact-pair endpoint is no-store, avoiding the existing worker's month-only query canonicalization.
- Malformed stored payloads fail the read, preserving same-key last-good browser values with an error indication. Latest route and time-band months are selected separately, retaining each operation's own adjacent predecessor. A new route month does not erase an older valid time-band reference.
- Existing A6 daily 06:07 KST plan already requests the latest ended month (November checks October), plus at most three missing older months per operation within a thirteen-month window. Existing changed-only compact storage, quota/auth stopping and last-good rules remain. No additional schedule, migration, provider query, or bulk backfill was executed.
- Accepted responses now retain response-count evidence in their compact payload. This can cause one normal changed-only rewrite of previously stored payloads when next checked; no extra request budget is introduced.

## Evidence and limits
- Main inspected: 554b9e6c600f07dd67e3d24348a822bf8e3b5510. Separate from PR477 and calendar PR478.
- Actual production D1 2026 inventory is unverified: read-only production URLs were unavailable through the supported web tool. No alternative auth/network path or bulk collection was attempted. The UI derives available months from actual stored keys after deployment; this work does not claim January–September are all present or October–December published. Runtime collection enable flags also remain unverified.
- Parent verified the target screenshot pixels. Local Library materialization had the previously reported Windows limitation; no browser/materialization bypass was attempted.
- Local browser execution remains excluded after the previous refusal. New four-language 320/1440 interaction, missing-month, disclosure and refresh regressions are committed for CI. Static checks, SQLite tests, build and HTML checks are local evidence only.
- Design review: native labelled selects, explicit light palette, 44px controls, keyboard focus, closed detailed evidence, existing compact table/flags and no new library. Reviewed against vendored frontend/web guidelines and current upstream web-interface rules.
