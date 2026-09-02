# Seoul Realtime Commercial Signal Design

**Date:** 2026-09-02  
**Status:** owner-approved through the standing instruction to finish the data expansion without further decision prompts  
**Scope:** Phase 2 only — Seoul Open Data OA-21285 realtime commercial activity for Myeongdong, Hongdae, and Seongsu

## Goal

Add the official OA-21285 realtime commercial block to KORETAIL without
increasing the normal Seoul request count, weakening data-truth labels, or
mixing a differently suppressed signal into the existing population table.

The product must say exactly what the source represents: realtime Shinhan Card
**domestic-consumer** payment activity published through Seoul city data. It is
not total POS sales, foreign-card spend, tourist spend, or an estimate of every
merchant's revenue.

## Chosen architecture

The collector changes each area's existing request from `citydata_ppltn` to
the integrated `citydata` service. One response contains both
`LIVE_PPLTN_STTS` and `LIVE_CMRCL_STTS`, so the normal schedule remains exactly
one provider request per area and three per run.

Population remains under `SEOUL_CITYDATA_PPLTN` and keeps its existing tables,
normalizer, timestamps, and UI contract. Commercial activity receives its own
source identity, `SEOUL_CITYDATA_CMRCL`, its own canonical normalizer, table,
source health, summary query, and UI row. A failure or provider suppression in
one block must not erase or falsely downgrade a usable block from the same
response.

Rejected alternatives:

1. Calling `citydata_cmrcl` separately would add three requests per run and
   double the normal Seoul request budget.
2. Adding nullable commercial columns to `seoul_realtime_area` would couple
   two different publication/suppression lifecycles and make last-good
   preservation unsafe.

## Contract gate

Before Production collection is changed, the existing workflow-dispatch-only
one-shot workflow gains a separately gated read-only `PROBE` mode. It makes
exactly one authenticated integrated-city-data request for each configured POI
(`POI003`, `POI007`, `POI068`). It prints only:

- the POI code;
- HTTP and official result status;
- whether the population array and commercial object exist;
- the presence/type of required fields;
- whether optional payment values are published or suppressed.

It never prints the key, authenticated URL, area values, payment values, or raw
payload. The probe step receives no D1 credentials, writes nothing to D1, and
has no schedule. Failure at this gate stops Phase 2 activation rather than
guessing a contract.

## Canonical commercial record

`seoul_realtime_commercial` stores one changed-only current observation per
area/reference time:

- `source_id`, `record_origin`, `area`, `area_code`, `area_name`;
- official `commercial_level`;
- nullable `payment_count`, `payment_amount_min`, and `payment_amount_max`;
- `observed_at` from `CMRCL_TIME` and `retrieved_at`;
- freshness, schema version, quality status, and semantic source hash.

The semantic hash excludes retrieval time. The unique key is
`source_id + area + observed_at`; a second identical collection writes zero
changed rows. Payment values remain nullable because Seoul can suppress low
sample data. Suppressed or absent values are never converted to zero.

Category and demographic arrays are validated by the contract probe but are
not stored in this first product slice because no approved UI consumes them.
This avoids unused retention and prevents accidental demographic profiling.

An `(area, observed_at DESC)` index supports the bounded latest-row-per-area
summary query. The migration adds no scheduler and no raw snapshot table.

## Collection and health semantics

For every area, the integrated envelope is validated once and then the two
blocks are normalized independently:

- a valid population block is persisted and counted for
  `SEOUL_CITYDATA_PPLTN` even if commercial data is absent;
- a valid commercial block is persisted and counted for
  `SEOUL_CITYDATA_CMRCL` even if population data is malformed;
- a suppressed optional payment field does not make an otherwise valid
  commercial observation fail;
- an absent/malformed commercial object records a commercial-area failure and
  preserves the last-good row.

Each source gets its own collector run and source-health result. Full 3/3
coverage is `LIVE`. Partial coverage is `STALE` when stored last-good data
exists, otherwise `ERROR`; it is never labelled `LIVE`. The failure detail is
bounded and secret-redacted.

## API and UI

`/api/live/summary` performs one bounded indexed seek per known area and adds a
`commercial` object to each area block. The response contains the official
level, nullable payment fields, observation/retrieval timestamps, and computed
`LIVE`/`STALE` freshness.

`LiveSignals` places the commercial row immediately after current population,
so it is visible high in “Signals moving demand today.” It shows the official
commercial level and, only when both bounds exist, the official payment range.
The permanent four-locale note states:

- Korean: `신한카드 내국인 소비 기준 · 전수 매출 아님`
- English: `Shinhan Card domestic-consumer activity · not total sales`
- Chinese: `基于新韩卡韩国境内消费者活动 · 非全量销售额`
- Japanese: `新韓カードの国内消費者活動基準 · 売上全数ではありません`

No copy calls this foreign spend, tourist spend, total sales, or POS revenue.
If no official commercial row exists, the row is omitted rather than filled
with a placeholder or zero.

## Performance and operations

- normal provider calls remain three per realtime run;
- retry policy remains the existing bounded one retry per area;
- Production retains exactly five Cloudflare trigger-only Cron expressions;
- D1 reads add three indexed latest-row seeks per uncached summary;
- changed-only persistence and summary rows-read are measured before merge;
- the shared Edge Cache must still demonstrate MISS then HIT;
- Production activation is complete only after migration, collector evidence,
  source health, summary/UI smoke, and actual `rows_read` evidence all pass.

## Test strategy

Tests first cover the independent failures this change could introduce:

- integrated envelope extraction and one-call-per-area URL contract;
- canonical parsing, nullable suppression, timestamp normalization, and
  retrieval-time-independent hashing;
- independent population/commercial persistence and health;
- idempotent changed-only writes and last-good preservation;
- migration uniqueness/indexes and bounded summary read plan;
- four-locale truthful UI rendering and omission when absent;
- no new schedule/Cron and no secret/raw-value output in the probe;
- full unit/build/render/browser/secret checks before push.
