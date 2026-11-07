# Earlier first-screen flight data — 2026-11-05

Baseline: `c2ae784db00e174abbb4a0435ce175238154ed43` (deployed PR #583).
That preparation-entry split is retained. This change only adds an HTML fetch
preload for the home flight day and starts the existing one-use week-reference
read-ahead alongside flights. The response validators, shared caches, retry
limits, selected-date/terminal logic and snapshot-basis checks remain unchanged.
No CSS, exchange-rate logic, calculations, provider calls, scheduler, schema,
Worker settings, credentials or paid service changes are included.

## Matched measurement

The local comparison uses the latest baseline and candidate production builds,
gzip static assets, three cold Chromium contexts per width and the same captured
public responses. Capture time, response hashes, individual summaries and API
timings are recorded in `EARLY_FLIGHT_DATA_20261105.json`.

The capture's service day is **2026-11-06 KST** (2026-11-05 UTC). Each recorded
public round-trip duration is replayed as a fixed API response delay. Playwright
API fulfillment bypasses network throttling; static assets use real local HTTP
gzip plus the same configured network/CPU throttle. Mobile: 390×844, 4× CPU,
150ms RTT, 1.6Mbps. Desktop: 1440×1000, 1× CPU, 20ms RTT, 20Mbps. Both restore T2.
This measures frontend scheduling under controlled response delays, **not live
backend speed or a production-wide improvement**. The historical uncompressed
seven-second result is not used as production evidence.

| Median | Mobile before | Mobile after | Desktop before | Desktop after |
|---|---:|---:|---:|---:|
| FCP / LCP ms | 1,560 | 1,540 | 296 | 268 |
| Hydrated marker ms | 4,058.5 | 4,041.1 | 564.3 | 559.6 |
| Visible flight metric ready ms | 4,859.3 | 4,234.7 | 2,383.1 | 2,407.2 |
| CLS | .04613 | .04543 | .02273 | .02273 |
| Observed blocking ms (not Lighthouse TBT) | 198 | 196 | 0 | 0 |
| Initial transfer bytes | 1,382,652 | 1,382,695 | 1,507,059 | 1,507,102 |

Mobile flight data appears **624.6ms (12.9%) earlier** in this lab. Desktop flight
readiness is effectively unchanged (+24.1ms); do not claim a desktop flight-data
speedup. Week-reference response completion moves from 5,414.4 to 3,757.9ms on
mobile and 2,913.4 to 1,001.0ms on desktop; these are API completion times, not
the time every comparison has rendered. The existing frontend release budget
passes. Every run has one flight read, one week read, no unknown fixture API,
no page error, and completed hydration. Transfer increases by 43 bytes.

Flight/people/comparison/exchange-rate text and selected scope are identical
before/after. The first viewport is pixel-identical at both widths. Later
time-dependent graph pixels differ; full-page pixel identity is not claimed.

## Safety and validation

- Typecheck and whole-repository lint: pass (25 existing warnings).
- Production build and rendered HTML: pass, 53 rendered tests; all linked
  assets exist. The Windows local static-server workaround is used equally.
- Full unit suite: 2,826 pass. Eight environment-dependent failures from the
  restricted Windows loopback/Git runner were rechecked successfully in the
  normal execution environment. The final full suite then passed there.
- Protected UI hashes and scheduler locks remain unchanged. Only three exact
  nonvisual home resource-hint hunks are reversed before the existing hashes.
- Browser hydration/week comparison/early-read group: 22 pass; after adding
  the stale previous-date case, the complete seven-test early-read file passes.
- Forty actual HTML contracts cover four locales, today, explicit/duplicate/
  invalid dates, year transitions, valid leap day and invalid non-leap day.
- Held-flight browser regression proves comparison starts before the flight
  response finishes, and T1/T2 switches reuse the same single flight read.
- HTTP failure, degraded 200, wrong-date body and malformed JSON never confirm
  zero flights; one shared focus refresh recovers. Late previous-date responses
  cannot replace the newly selected date.
- Current-build Chromium loader harness: nine cases pass, including twelve
  concurrent consumers sharing one request, transport recovery, year/leap-day
  KST rollover, server/device disagreement and late response isolation. All
  fields of the captured **550-flight** payload match exactly after loading.
- Unit coverage retains 120s expiry, bounded interrupted-body retries, midnight
  cache invalidation, one-use/10s read-ahead freshness and 15s body deadline.
- Full reachable-history secret scan: passed. Checkout health: UNKNOWN without
  production credentials; no production health/CPU/quota claim is made.

Server HTML generation and client execution can straddle KST midnight, or the
device clock can disagree with the server. An unused preload can then add one
read; it is never reused for a different date. This is bounded but not a promise
of zero extra reads on every device. JavaScript-disabled visits can also consume
the hint without mounting the client. Firefox/Safari remain unmeasured locally.

## Release tracking

Release only after exact-head remote CI, merge/main CI, the existing deployment
workflow and `/api/build` SHA verification. Keep this task's PR as the record of
the final commit, run links, deployment and mobile/desktop production checks.
