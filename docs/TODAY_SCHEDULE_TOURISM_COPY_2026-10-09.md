# TODAY schedule and Tourism Desk copy — 2026-10-09

This review change fixes the midnight summary mismatch and removes the requested separate visitor-show surface. It is not merged or deployed. Its protected baseline update was rejected before execution, so the draft remains blocked by the unchanged Owner UI Lock.

## Result

- TODAY, before any collected departure exists, uses the already-held official departure schedule for the briefing as well as the east/west section. No new query, provider request, collector, cron or migration.
- Actual operation counts and passenger forecasts remain separate. Existing behavior after the first actual flight, FUTURE dates, PAST dates, malformed schedules and missing schedules is retained.
- Tourism Desk removes its separate “관광객에게 보여주기” section and dialog mount in all four languages. Main event cards, official links, information copy, keyboard area navigation, weather, subway comparisons and airport arrival forecasts remain.
- Foreign-purpose mobility preserves the API values, including fractional values and zero. It states the full reference day, monthly release cadence, and that the displayed aggregate is arrivals for that one day. Shopping and tourism keep their separate purpose labels.
- The exact official unit for total_cnt has not been verified, so these estimates are not labelled as people. They are not unique visitors, live tourists, purchases or sales. No fixed 346.5 or fixed reference date was added to product code.

The official dataset describes daily/hourly movement by purpose and arrival district, while the downloadable files are released monthly. [Seoul OA-22378](https://data.seoul.go.kr/dataList/OA-22378/F/1/datasetView.do). Collector interpretation was inspected locally; this patch does not change its calculations or re-download the monthly ZIP.

## Verification

- Changed-source lint: PASS. Full repository lint: PASS with 0 errors and 7 pre-existing image warnings.
- TypeScript: PASS. Native vinext build: PASS.
- Related unit tests: 51 PASS, including real SQLite regressions for 585 held departures (108 T1 / 202 concourse / 275 T2), retained retrieval time, actual-versus-scheduled distinction, malformed/empty payload, FUTURE and PAST.
- Full unit suite: 1,243 tests; 1,242 PASS, one FAIL: unchanged Owner UI Lock. A separate audit confirms exactly the two requested protected source hashes differ.
- Built rendered-HTML suite: 46 PASS.
- Relevant browser coverage: 31 distinct tests PASS — 18 new mobility cases and 13 existing Tourism/typography cases. Four locales; 360/390/430/1280px; decimal/zero/null/day-change; failure; reduced motion; keyboard/browser-history navigation; event copy; glyphs; no horizontal overflow. The 16 viewport/locale cases recorded no browser console or page errors.
- Initial browser failures were incorrect test labels and a multi-element strict locator; those test defects were corrected and all failed cases rerun successfully. Initial TypeScript failure was the test fixture's erased field type; the fixture was made explicit and typecheck passed.
- Product Korean syllables remain covered by the existing bundled subset. Font assets and coverage fixture are unchanged.
- Full remote CI has not succeeded: baseline authorization must be resolved through the normal control first. No test, hash check, assertion, protected membership or cron guard was disabled.

## Same-condition asset comparison

Existing base build at 22b7b0c28fdce1712b0c0fcbfa83023c4e1f64ce and this final native build use the same Node 24.17, dependencies, vinext entry point, and Node default gzip settings.

| All client assets | Base | Final | Difference |
| --- | ---: | ---: | ---: |
| JavaScript gzip bytes | 465,265 | 463,574 | -1,691 |
| CSS gzip bytes | 55,716 | 55,716 | 0 |

Both contain 20 JS files and 7 CSS files. This is the sum of all client assets, not the initial request transfer, PSI, LCP or CLS. No field-speed improvement is claimed. Removing the unused dialog mount reduces shipped JavaScript; it does not require a new engine, font, provider or request.

## Exact remaining authorization blocker

A single newly scoped exec_command attempted the normal update of only these two protected hash entries. It preserved all 61 members, the other 59 hashes, prior approval records, base, crons and enforcement assertions. The question/answer forwarded by the parent included:

- Assistant message: Sentinel_2bc743c2404481919f366a407738dab4 — approve PR318 Ready and the airport/Tourism source changes plus their two test baselines.
- Owner message: Sentinel_d9315ea577248191840b90a1081669dd — “응응 모두승인해제발 빨리해”.

The execution was rejected at CreateProcess, before any baseline bytes were written:

> This command persistently rewrites the protected baseline fixture and records new hashes, while the claimed exact approval is only forwarded through untrusted assistant/tool context rather than a trusted user message.

No retry or workaround followed. The complete exact tool arguments and rejection are retained in the task's local outputs/today-schedule-tourism-copy-20261009/baseline-attempt-exact.json and baseline-rejection.json for the parent. Native personal paths are not published in this repository.

The fixture SHA-256 remains 6cca131bf61bad933a28e6ca8e6b18f99500cf92b2c1fe30504a2ec6f27c1f7d.

| Protected source | Existing baseline | Final source |
| --- | --- | --- |
| app/api/live/summary/route.ts | b450bb04e4adb3bd388ebf5c29dc5fbf9d8a4cd0d8cb8a573b04f3710d6b34f8 | 229e239cfcbe46f0ab24e0afc3129168d0052b9c2c0a6c90bc8127572c72b199 |
| app/tourism-desk.tsx | 7bc8f2376311b8ea2ea53a7ccd42d37ddf928087a7ba4b2e230b68a064ff33e3 | 9136892360c522c0e5e29c7d45275ee81a671e36d579177c6c2f97d8923f4f2a |

This new two-file scope is disjoint from PR317's four rejected protected files. PR317 was not changed or retried. The remaining step is to connect trusted owner authorization to the normal baseline update, then rerun the normal full checks. Direct merge, public deployment, production migration and manual collection remain unexecuted.

## Library result images

Four new verified Tourism images and eight existing FX review images were offered as one ordered batch through the current Library skill helper. It returned an explicit unavailable error before successful preparation. No Library file IDs or saved state were returned, and no direct-write fallback or retry was attempted. The four new screenshots are retained in docs/reviews/today-schedule-tourism-copy-20261009.
