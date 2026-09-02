# Store Dynamics Design

**Status:** Owner-approved implementation design  
**Date:** 2026-09-03 KST  
**Source:** Seoul Open Data OA-15577, `VwsmTrdarStorQq`

## Goal

Add a truthful, low-cost view of quarterly store stock, openings, closures,
and franchise composition for KORETAIL's Myeongdong, Hongdae, and Seongsu
areas. This is structural historical context, never a live signal or business
quality judgement.

## Verified official contract

The current OA-15577 contract accepts `STDR_YYQU_CD` and `TRDAR_CD` after the
standard Seoul Open Data paging segments. The 2026-09-03 public sample probe
returned `INFO-000` for `20261` and exposed these fields:

- `STDR_YYQU_CD`
- `TRDAR_SE_CD`, `TRDAR_SE_CD_NM`
- `TRDAR_CD`, `TRDAR_CD_NM`
- `SVC_INDUTY_CD`, `SVC_INDUTY_CD_NM`
- `SIMILR_INDUTY_STOR_CO`
- `STOR_CO`
- `FRC_STOR_CO`
- `OPBIZ_RT`, `OPBIZ_STOR_CO`
- `CLSBIZ_RT`, `CLSBIZ_STOR_CO`

The dataset page says total store count is ordinary plus franchise store
count. The official Seoul commercial-analysis service defines opening and
closure rate as the corresponding period's reported count divided by total
store count, multiplied by 100. The public metadata currently identifies the
source as annual-refresh, slow-moving data and states that records from 2024
use the standard-unit-area basis.

## Versioned geographic mapping

Mapping version: `oa-15577-standard-area-2026-09-03-v1`.

| Product area | OA-15577 code | Current official name | Type | Rule |
|---|---|---|---|---|
| Myeongdong | `3001492` | 명동 남대문 북창동 다동 무교동 관광특구 | `U` | one official area only |
| Hongdae | `3120103` | 홍대입구역(홍대) | `D` | one official area only |
| Seongsu | `3110131` | 성수동카페거리 | `A` | one official area only |

All three mappings returned `INFO-000` with the exact code, name, and period
in the current OA-15577 sample contract. They also match the one-primary-area
mapping already used by KORETAIL S3 estimated sales. Alternate S3 areas are
not summed into this product; doing so could overlap geography and double
count stores.

## Data model and aggregation

The collector validates every industry row, then aggregates outside D1 to
exactly one compact row per product area and quarter. It stores:

- official source and dataset identifiers;
- explicit mapping version, area code, name, and type;
- reference quarter;
- summed official total, ordinary, franchise, opening, and closure counts;
- opening and closure rates recomputed from the summed official counts using
  the official formula, stored in tenths of one percent;
- contributing industry count, retrieval time, schema version, validation
  status, and semantic hash.

No raw provider payload or unbounded industry history is stored. The unique
key is source + mapping version + area + quarter. An index on area and quarter
supports the bounded latest lookup.

## Collection flow

`collectStoreDynamics` joins the existing weekly SLOW workflow that already
collects S3. It probes at most five recent quarters using one verified mapping,
then fetches at most three 1,000-row pages for each of three areas. Normal cost
is one successful quarter probe plus three area pages. There is no new
Cloudflare Cron and no browser/request-time provider call.

Writes are semantic changed-only upserts. A failed, empty, mismatched, or
malformed response writes no store row and preserves last-good data. Source
health becomes `STALE` when stored last-good exists and `ERROR` when it does
not; success is `OFFICIAL_HISTORICAL`.

## Public API and UI

`/api/live/summary` performs one indexed latest-row lookup per area and adds a
`storeDynamics` object to each area block. The existing Edge Cache covers the
result; the source is never fetched from a page request.

The UI renders a dedicated historical card under “Past commercial-area
information / 과거 상권 정보” in all four locales. It shows total stores,
ordinary stores, franchise stores, openings and rate, closures and rate, the
official reference quarter, mapped official area, source, and a neutral
limitation. It never says live, today, current store count, good area, bad
area, survival, quality, success, or risk.

## Verification

Tests cover the exact field contract, invalid/mismatched rows, official rate
formula, one-area mapping, no double count, bounded requests, changed-only
idempotency, Last-good preservation, additive migration, indexed lookup,
four-language truth copy, Edge Cache eligibility, and unchanged five-Cron
ceiling. Production acceptance additionally requires authenticated collection,
three-area values, Source Health, Edge Cache HIT, actual rows_read, and visual
checks before the phase is closed.

