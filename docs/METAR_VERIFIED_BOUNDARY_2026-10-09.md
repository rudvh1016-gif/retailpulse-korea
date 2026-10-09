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

Production imports of the new module: none. The frontend, API routes, database,
collector runners, workflows, scheduler and existing airport placeholder were
not changed. UI builds/E2E and runtime serving latency are therefore not new
local verification claims; normal PR CI remains authoritative for its result.

Before public connection: review source reuse terms/account quota and cadence,
wire canonical changed-only storage with actual concurrent-write tests, select
one approved existing scheduler owner, then connect stored read data and UI
under the original file-specific approval procedure. Those actions are not
completed by this PR. The pending Seongsu/arrival/Seoul-model UI approval bundle
is separate and remains untouched. Owner-controlled merge/release is still
required; this branch must not deploy independently.
