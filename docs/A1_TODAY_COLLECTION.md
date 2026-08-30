# A1 current-day departure collection

Status: bounded manual fallback, 2026-08-30 KST.

The official A1 catalog states that the flight-detail API covers D-3 through D+6 and supports date/time filtering by a query-time classification code. The exact request parameter names/allowed values have not yet been verified from the provider guide, so KORETAIL must not guess them.

Until those exact parameters are verified, `airport_flights_today` uses the already-authenticated A1 endpoint with only the verified common paging parameters (`type`, `numOfRows`, `pageNo`). It requests 100 rows per page, reads the provider-declared `totalCount`, refuses more than 150 pages, scans pages sequentially, and persists only rows whose verified `scheduleDatetime` service date equals the target KST date. It scans every declared page, so correctness does not depend on undocumented provider sort order.

The first Production attempt proved that even a 100-row A1 page can intermittently terminate at the provider/gateway around ten seconds. The public portal's timeout guidance says to retry after a timeout. Each page therefore gets at most one retry, sequentially, with a short delay. The 150-page hard bound means a strict worst-case ceiling of 300 A1 requests for one manual run. A1's public catalog currently documents 500 development calls/day. This fallback therefore must remain manual while the development quota applies. It is not approved for recurring collection. If the exact official date/time parameters are later verified, replace this full-window fallback with the narrower official query and re-audit quota/cadence before enabling any schedule.

Truth and safety boundaries:

- flight rows are not passenger counts, shoppers, or sales;
- codeshares are deduplicated through the existing `physical_flight_id` contract;
- no provider key or provider URL containing a key is logged;
- Production Collector remains OFF;
- Worker Cron remains absent;
- Demand Index remains DEMO.
