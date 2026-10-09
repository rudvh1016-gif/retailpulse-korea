# RKSI METAR verified observation boundary

Based on current main `71b88933866222e5ba4f3e491a2feca8ce982319`.
This prepares a pure data boundary, without activating a production source.

## Authenticated provider evidence

The latest delegated instruction authorized one minimum necessary connection
check with existing credentials. Existing `metar-schema-once` mode ran from
`8bef7e75ab57d816bbcb88f341ee0e9da4ee9d34` using the protected production
environment's existing secret. No new credential or environment setting was
created. The existing fixed `getMetar` request used `icao=RKSI`, JSON, page 1,
100 rows, a 30-second deadline, a 1 MiB body cap and zero retries.

[Run 37876242438](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/37876242438)
succeeded: HTTP 200, provider code `00`, `VERIFIED_CONTRACT`, one report,
1416 ms to completion. Other jobs, including normal collection, were skipped.
The response was JSON containing direct IWXXM XML in `metarMsg`.

Actual public observation fields verified by the existing parser:

- Station RKSI, observation 2026-10-09 02:30 UTC / 11:30 KST.
- Surface wind direction 290 `deg`, mean speed 6 `[kn_i]` (knots).
- Temperature 22 `Cel`, dewpoint 15 `Cel`, QNH 1024 `hPa`.

The previous run 37491179068 timed out after DNS, before observed TCP connection.
That failure did not recur in this request. Its root cause remains unknown;
one successful request does not establish ongoing availability.
Prior GETs 4 + this GET 1 = 5; remaining authorized GETs 0. There were no retries,
D1 writes, raw response retention, merge, deployment or source activation.
The safe observation proof is in `reviews/metar-connection-20261009/connection-proof.json`.
This captured proof is a review fixture, not production weather data.

## Code

`scripts/parse-rksi-metar-item.mjs` is reused unchanged from the verified
commit. Original and candidate Git blob are both
`3ea31dda9177b4ac9abc83859ce9fb509c24ebf2`.
No parser rewrite or XML dependency was introduced.

`lib/airport-metar-observation.ts` consumes the complete getMetar envelope and
returns only RKSI observation fields and known measurement units. It selects
the newest complete observation; unreadable rows, incomplete paging, future
timestamps and conflicting same-time reports are withheld. Issue/trend times
cannot substitute for observation time. Zero is preserved; nil and unknown
units stay unknown. Raw XML, arbitrary fields and parser paths are excluded.

The pure read projection separates observation, retrieval and attempt time.
A failed refresh preserves original last-good timestamps and marks stale.
Its provisional 90-minute display threshold is not a provider publication SLA.
Cache lifetime cannot exceed 60 seconds or the remaining freshness interval;
stale, missing or unverified wind uses `no-store`.

Ground observations do not infer route turbulence or flight safety. Fog is
unknown because its field was not verified in this response. Seoul weather
cannot substitute for airport weather. No terminal or gate attribution is made.

## Verification and release boundary

Actually run: 13 new observation-boundary tests; full TypeScript check; lint of
the four new code/test files; the original Owner UI Lock / recurring schedule
test (1 pass); unchanged credential-pattern checks on new files. The lock and
its approval hashes were preserved. Existing parser suites and prior passed
audits were not repeated just for reporting.

The expanded candidate adds `airport-metar-store.ts`, the prepared migration
`0025_airport_metar.sql`, `/api/airport/weather`, and the existing `AirportWeather`
component already below current departure halls. The protected placement file
needs no weather edit. The route returns stored RKSI observations only: no
provider call, key access, migration or write on a visitor request. Unprepared,
empty or invalid storage stays unavailable. The bounded primary-key join
returns at most one row; actual Cloudflare row-read/CPU usage is not measured.

Canonical storage retains one current row and one attempt row, both classified
as A_CURRENT in the existing inventory. Semantic duplicates write zero
canonical rows and keep the original observation/retrieval clock. Attempt
metadata remains separate. A database claim commits the hourly budget before
a future loader runs; expired/crashed leases cannot reset it, stale leases
cannot overwrite new data, and blocking auth/quota outcomes defer 24 hours.
SQLite tests include two independent database connections. No operational DB
migration or write was performed, and no raw history/backfill is introduced.

The prepared collector has no production importer or enabled invocation.
Existing 15-minute realtime opportunities could use this persistent one-hour
guard for at most 24 single-request loader invocations/day with no immediate
retries or new scheduler. The existing weather workflow runs eight times/day;
its three-hour gaps exceed the provisional 90-minute freshness threshold, so
that alternative cannot sustain a current label. Neither path is activated.
The supplied account quota needs operational verification; the existing
one-shot request allowance remains exhausted. Normal UI-lock approval is not
authorization for new METAR requests or continuous collection.

The client reads the stored API once and keeps units, observation time and
retrieval time distinct. Freshness uses the server response clock plus elapsed
monotonic browser time, so an incorrect device clock cannot extend it. An exact
expiry timer turns current into stale without a new provider or API request.
Reserved space, tabular numerals and inherited typography keep the layout
stable. All four languages, 360/390/430/1280 widths, keyboard details, reduced
motion, zero, missing, malformed, failed, stale and expiry states are covered.
Local browser proof uses the captured safe observation fixture, not a public
production connection. Original fixture clock helpers are preserved.

Public METAR connection still requires source reuse terms/account quota and
cadence approval, approved operational migration/current-data write, actual
D1/Worker measurements, and one existing runner integration. Normal release
approval is also required. No source activation, settings change, new key,
additional provider request, merge or deployment was performed.

The separate retained-day/arrival/Seoul-model bundle received specific owner
approval on 2026-10-09. Its exact two protected hashes were updated normally,
with all61 protected paths, other59 hashes, historical approvals, cron values
and original assertion preserved. See `approvals/requested-integration-20261009.json`.
It is consolidated into this candidate so the owner receives one merge request.
