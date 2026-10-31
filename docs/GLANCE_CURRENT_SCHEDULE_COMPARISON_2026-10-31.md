# Glance: current-day schedule comparison and passenger title

Owner scope: replace the left heading with **출국객 수 (환승객 포함)**, keep the existing departure-plus-transfer arithmetic sum and both comparison calculations, compact the mobile calculation explanation without clipping, and fix an unnecessary current-day weekly-flight comparison block.

## Cause and data boundary

`DayProfile.complete` witnesses a successful scan **after the service day ended**. It does not mean that the all-page A1 feed scan failed while the day is in progress. Requiring that flag for today's scheduled departures incorrectly withheld a comparison even after the existing A1 collector had validated and stored its whole feed population. The historical gate remains unchanged: a previous weekday without a valid completed profile is unavailable, not zero.

Today's comparison is now explicitly a **collected schedule snapshot**, not final operated-flight counts and not a matched collection-time comparison. Both values use their scheduled KST service day, 00:00–24:00, the same physical-flight deduplication/cancellation policy and the same building boundaries. Collection times can differ; today's schedule can change. The UI displays its real collection clock, `KST`, changeability and “not actual operations.” A past day still needs its post-day scan evidence. Future selections do not inherit today's witness.

The current-day exception requires all of:

- latest same-day A1 collector row is `SUCCESS`, not a legacy first-page-only result;
- current A1 health is `LIVE` with the identical recorded retrieval clock;
- valid start/finish clocks, finished before the read, and a `recent from..selectedDay;` full-scan marker;
- the existing stored profile has the current schema/gate-table version, valid nonnegative safe-integer counts and matching 24-hour/side sums;
- profile departures plus separately excluded cancellations exactly equal that full scan's unique physical-flight population, within the existing public flight-read bound;
- the selected scope's validated profile total exactly equals the already displayed flight total;
- the displayed flights have the collected-record basis, not a held schedule fallback.

A failed, partial, legacy, wrong-day, incompatible, stale/unverified-clock or mismatched source stays unavailable. A failed witness read withholds the flight comparison without discarding independently valid passenger reference data. Genuine zero denominators never produce percentages. The current-day witness expires at KST midnight, including a cached response.

No provider calls, collection reruns, inferred records, zero filling, storage writes, schema migrations, scheduler changes, credentials, paid dependencies or runtime LLM calls were added.

## Bounded read and refresh cost

Historical selections retain the three exact-date existing-table reads. Today adds one existing-index source/start range seek joined to one source-health key, returning at most one row. All four reads use the same concurrent wave. SQLite `EXPLAIN QUERY PLAN` checks the production migrations' existing indexes; no source-history table scan is accepted. Runtime CPU and billed D1 usage remain unmeasured, not a free-tier safety claim.

The week witness now follows the already shared flight response's generation/basis refresh key. It waits for the first flight read to settle, avoiding a redundant initial witness request, and adds no timer or flight request. This lets an already-open page recover after a later successful collection instead of retaining an initial unavailable weekly response indefinitely.

## Presentation

The title no longer claims that the left sum excludes transfers. The forecast sum, departure and transfer values, prior-month forecast/flight daily averages, signs and precision are unchanged. The compact formula retains both labeled components and plus sign; its mobile supporting text is 9px rather than 10px, with each component unbreakable and the expression allowed to wrap safely on narrower screens. No forced single-line overflow, clipping or change to headline typography. Weekly basis text retains 10px mobile / 11px desktop.

Tests cover witness success/failure, latest-source health, stored-population equality, wrong dates, invalid clocks, KST midnight expiry, historical completion, SQL index plans, scope/count mismatches, independent passenger availability, zero denominators, localized snapshot wording, 320/390/1440px layout and recovery during an already-open session. Synthetic fixtures are not production availability evidence. Actual command results and exact release revision belong in the PR/check logs.
