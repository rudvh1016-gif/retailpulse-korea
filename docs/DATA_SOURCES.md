# Data Sources

Last verified: 2026-09-03 KST. Recheck official terms immediately before activating Production. The contract details below were verified against official portal documentation snippets and cross-checked working integrations; anything marked `UNVERIFIED` still needs one authenticated response before activation. A4-T2 and A5 were verified 2026-08-30 KST directly from the owner-supplied official Incheon International Airport Corporation OpenAPI 활용가이드 (not re-derived or guessed by an agent) — see §"A4-T2 and A5 — verified contracts" below.

## Fourteen-source integration matrix

| # | Source | Provider / dataset | Endpoint (verified level) | Key | Truth boundary |
|---|---|---|---|---|---|
| A1 | Airport detailed flight status | 인천국제공항공사 · data.go.kr 15140153 | `apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp` (CONFIRMED; arrivals operation name UNVERIFIED) | `DATA_GO_KR_SERVICE_KEY` | Flights ≠ passengers ≠ shoppers |
| A2 | Duty-free actual flights | data.go.kr 15134279 | `apis.data.go.kr/B551177/statusOfAPaxFlt4DutyFree/getAPaxFlt4DutyFreeDepartures` (AUTHENTICATED) | same | Same physical-flight population as A1 in the bounded check; A1 primary, A2 enrichment/validation only |
| A3 | Duty-free scheduled flights | data.go.kr 15134281 | `apis.data.go.kr/B551177/statusOfSPaxFlt4DutyFree/getSPaxFlt4DutyFreeDepartures` (AUTHENTICATED) | same | Scheduled ≠ actual observed flight; separate D1 model |
| A4-T1 | Departure-hall congestion, T1 | data.go.kr 15148225 | `apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion` (AUTHENTICATED) · `terminalId` P01=T1 only · fields `gateId`, `waitTime`, `waitLength`, `occurtime`, `operatingTime` | same | Checkpoint waits ≠ duty-free visitors ≠ sales |
| A4-T2 | Departure-hall congestion, T2 | 인천국제공항공사 · data.go.kr 15161098 | `apis.data.go.kr/B551177/statusOfDepartureCongestionT2/getDepartureCongestionT2` (VERIFIED, owner-supplied official guide) · see contract detail below | `DATA_GO_KR_SERVICE_KEY` | Checkpoint waits ≠ duty-free visitors ≠ sales; genuinely separate dataset from A4-T1, never a `terminalId` value on it |
| A5 | T1/T2 arrival/departure passenger forecast | 인천국제공항공사 · data.go.kr 15095066 (OpenAPI 활용가이드 V5.0) | `apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt` (VERIFIED, owner-supplied official guide) · see contract detail below | `DATA_GO_KR_SERVICE_KEY` | FORECAST/EXPECTED passengers ≠ actual observed queue; never written to `airport_congestion` |
| S1 | Seoul integrated real-time city data | 서울 열린데이터광장 OA-21285 | `openapi.seoul.go.kr:8088/{KEY}/json/citydata/1/5/{POI}` (AUTHENTICATED 2026-09-02) · POI003 명동 관광특구 · POI007 홍대 관광특구 · POI068 성수카페거리 · root `RESULT["RESULT.CODE"]="INFO-000"` + `CITYDATA.LIVE_PPLTN_STTS[]` + `CITYDATA.LIVE_CMRCL_STTS` · one integrated request/area retains the former 3 calls/run · population `FCST_PPLTN` horizon retained · commercial `AREA_CMRCL_LVL`, nullable Shinhan payment count/range, `CMRCL_TIME`, category array | `SEOUL_OPEN_DATA_KEY` | Live population ≠ shoppers; Shinhan domestic-consumer activity ≠ total/POS/foreign/tourist sales |
| S2 | Short-stay foreign living population | 서울 OA-23018 `[단기외국인] 행정동별 서울 생활인구(250m)` | `openapi.seoul.go.kr:8088/{KEY}/json/Spop250mFornTempDong/1/5/` (authenticated `INFO-000`, 5 rows, 2026-08-29) · optional filters `YMD`, `TT`, `H_DNG_CD` | `SEOUL_OPEN_DATA_KEY` | `SPOP` is the total; nationality columns are dimensions and must not be added to it. Short-stay foreign living population ≠ stay population ≠ tourist ≠ shopper ≠ sales |
| S3 | Estimated commercial sales | 서울시 상권분석서비스(추정매출-상권) OA-15572 | `openapi.seoul.go.kr:8088/{KEY}/json/VwsmTrdarSelngQq/{start}/{end}/{STDR_YYQU_CD}` (CONFIRMED; live verification 2026-08-27 showed only the quarter positional filter applies — trade-area segments are ignored, so the collector sweeps the quarter in 1000-row pages and filters client-side) · quarterly 20211–20261 · fields `THSMON_SELNG_AMT/CO` + weekday/time/gender/age splits · trade areas: 명동 3001492(관광특구)·3120028(명동거리)·3120027(명동역), 홍대 3120103(홍대입구역)·3120102(서교동)·3120104(연남동), 성수 3110131(성수동카페거리)·3120052(성수역) | same Seoul key | 추정매출 = modelled estimate, NOT live POS sales, NOT foreign spend |
| S4 | Foreign shopping/tourism-purpose destination mobility | 서울 수도권 생활이동 OA-22378 `[도착지 기준]-외국인` | monthly ZIP via official dataset page + documented `nio_download.do` form; latest daily `seoul_purpose_admdong1_forn_YYYYMMDD.csv`; `d_admdong_cd`, `move_purpose`, `total_cnt`, `etl_ymd`; official purpose 4=shopping, 5=tourism | none | Monthly statistical estimated movements ≠ visitors ≠ purchases ≠ sales ≠ real-time activity |
| S5 | Seoul station daily boarding/alighting | 서울교통공사 OA-22723 `서울시 교통공사 지하철역 역별승하차인원 현황` | `openapi.seoul.go.kr:8088/{KEY}/json/getStnPsgr/1/1000/{YYYYMMDD}/{stnCd}`; date required, station code exact filter; official portal says recent seven-day window and daily refresh; current sample envelope `response.header.resultCode=00` + `response.body.items.item[]`; fields `pasngDe`, `pasngHr`, `stnCd`, `stnNo`, `stnNm`, `lineNm`, `rideNope`, `gffNope` | `SEOUL_OPEN_DATA_KEY` | Station gate boardings/alightings ≠ unique people ≠ area visitors ≠ shoppers ≠ foreign visitors ≠ sales ≠ real-time population |
| S6 | Quarterly Store Dynamics | 서울시 상권분석서비스(점포-상권) OA-15577 | `openapi.seoul.go.kr:8088/{KEY}/json/VwsmTrdarStorQq/{start}/{end}/{STDR_YYQU_CD}/{TRDAR_CD}` (public sample contract reverified 2026-09-03; latest published `20262`, `20263` returned official no-data) · exact fields and mapping below | `SEOUL_OPEN_DATA_KEY` | Official quarterly historical store stock/opening/closure facts ≠ current operating-store count ≠ area quality, survival, risk, success, or prediction |
| W1 | KMA short-term forecast | 기상청 · data.go.kr 15084084 | `apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` (CONFIRMED) · issued 02/05/08/11/14/17/20/23 KST (+~10min) · grids: 명동 (60,127) · 홍대/서교동 (59,126) · 성수 (61,126) · 인천공항/운서동 (51,125) · categories POP/PTY/PCP/REH/SKY/TMP/TMN/TMX/WSD… · `PCP`/`SNO` are strings ("강수없음", "1.0mm 미만") · SKY 1=맑음 3=구름많음 4=흐림 · resultCode "00"=OK, "03"=NO_DATA · 10,000 calls/day dev | `DATA_GO_KR_SERVICE_KEY` | Forecast ≠ observation; issue time ≠ target time |
| T1 | Tourism events (TourAPI) | 한국관광공사 B551011 · KorService2 (KorService1 shut off ~2025-08) | `apis.data.go.kr/B551011/KorService2/searchFestival2` (CONFIRMED) · `eventStartDate` required · `locationBasedList2` (mapX/mapY/radius≤20000, contentTypeId=15, `dist` in response) for area mapping · success resultCode "0000" · v4.4 deprecates `areaCode`/`sigunguCode` in favor of `lDongRegnCd=11`(서울)/`lDongSignguCd` · 1,000 calls/day dev | same data.go.kr key | Event existence ≠ attendance ≠ demand ≠ sales |
| T1-detail | Official event category name + description | same KorService2 | `categoryCode2` (contentTypeId=15, cat1, cat2 → `{code,name}`; cached in `tourapi_category_codes`, one lookup per unresolved cat2 group, ≤3/run) · `detailCommon2` (contentId → `overview`, `homepage` anchor HTML, addr1/addr2, tel; fetched ONCE per contentId by the daily collector, marked by `detail_retrieved_at`, ≤12/run) · list fields cat1/cat2/cat3, addr2, tel stored from the same `searchFestival2` response at zero extra calls · worst case 1+3+12 = 16 calls/day | same data.go.kr key | Only the provider's own words are shown (deterministic HTML strip + first-complete-sentence preview, with the complete stored overview expandable); no description is ever generated or guessed; the browser and `/api/live/summary` never call TourAPI |

No paid API, paid data, paid fallback or runtime LLM is approved. A source without verified commercial and automated-use terms remains disabled.

## S6 Store Dynamics official contract (2026-09-03)

OA-15577 service `VwsmTrdarStorQq` exposes quarterly industry rows. A bounded
public sample check found `20262` as the latest published quarter (`20263`
returned official `INFO-200`) and verified these fields exactly:
`STDR_YYQU_CD`, `TRDAR_SE_CD`, `TRDAR_SE_CD_NM`, `TRDAR_CD`, `TRDAR_CD_NM`,
`SVC_INDUTY_CD`, `SVC_INDUTY_CD_NM`, `SIMILR_INDUTY_STOR_CO`, `STOR_CO`,
`FRC_STOR_CO`, `OPBIZ_RT`, `OPBIZ_STOR_CO`, `CLSBIZ_RT`, and
`CLSBIZ_STOR_CO`. The response does not publish a source-update timestamp.

Mapping version `oa-15577-standard-area-2026-09-03-v1` uses exactly one
official area per product area: Myeongdong `3001492` / `U` /
`명동 남대문 북창동 다동 무교동 관광특구`, Hongdae `3120103` / `D` /
`홍대입구역(홍대)`, and Seongsu `3110131` / `A` / `성수동카페거리`. No nearby
or overlapping trade area is added. The latest sample envelope reported 88,
90, and 68 industry rows respectively. Only the first five rows per area were
read during the public sample verification; authenticated Production
collection must still validate every row before writing any area aggregate.

Every count is a non-negative integer; total stores must equal ordinary plus
franchise stores. Duplicate industries, wrong geography, wrong quarter,
malformed values, incomplete pagination, and empty results fail closed.

### Rate semantics: what is official, what is not (2026-09-03)

OA-15577 publishes, per industry row: `SIMILR_INDUTY_STOR_CO`, `STOR_CO`,
`FRC_STOR_CO`, `OPBIZ_STOR_CO`, `OPBIZ_RT`, `CLSBIZ_STOR_CO`, `CLSBIZ_RT`.
The separate official 서울시 상권분석서비스 methodology
(https://golmok.seoul.go.kr/smallRegionStatistics.do and
https://golmok.seoul.go.kr/source.do) defines 점포수 as 사업자등록번호-based
Seoul businesses, 점포수 산식 as `당기 운영 점포수 + 폐업 점포수`, and 개/폐업률
as `(당기 개/폐업신고점포수 / 전체점포수) × 100`. It does not restrict the rate
to 0–100.

The first authenticated Production collections established, with real rows,
that the denominator the provider divides by is **not** reconstructible from
the OA-15577 row fields for every row: two candidate reconstructions
(`SIMILR_INDUTY_STOR_CO`; that total with the event backed out or added back)
each matched some real rows and contradicted others across eight captured
rows, and a ninth (`hongdae`, `CS200046`, total 0, closure count 1) proved a
count can exceed the row's ending total. A tenth (`seongsu`, `CS200015`,
total 1, closure count 2) published `CLSBIZ_RT = 200`: a percentage exceeds
100 whenever the event count exceeds its denominator. An earlier
`<= 100` validator, a count-bound validator, and two recomputation formulas
were each disproven by this evidence and removed (PRs #90–#92 and the
official-contract fix).

KORETAIL therefore:

- preserves each provider-published row rate when it is a finite,
  non-negative, sanely represented number, and applies **no** upper bound
  (no 100, 200, 500, or 1000 ceiling: the provider states none);
- never recomputes a row rate from that row's counts;
- never manufactures an area-wide official percentage: the stored
  `opening_rate_tenths_percent` / `closure_rate_tenths_percent` columns hold a
  documented KORETAIL-derived ratio (`round(Σcount × 1000 / Σending total)`)
  solely so the existing `NOT NULL` columns stay populated without a
  destructive migration, and neither `/api/live/summary` nor the UI exposes
  them;
- exposes, for Phase B v1, only the area aggregates whose meaning is
  unambiguous: total, ordinary, franchise, opening, and closure counts,
  industry count, the official reference quarter, and the official trade-area
  name. A deliberately omitted ambiguous percentage is preferable to an
  invented one. The collector probes at most five quarters and at
most three 1,000-row pages per area, validates all three areas in memory, then
writes one compact changed-only row per area/quarter. Retrieval time is not
part of the semantic hash. Failure preserves stored rows and reports `STALE`
only when one semantically valid, same-quarter Last-good row exists for all
three exact mappings; otherwise it reports `ERROR`. Valid data reports
`OFFICIAL_HISTORICAL`, never `LIVE`.

The public area figures are KORETAIL-derived sums of the unique official
industry rows, not a provider-published single area-total row and not a claim
to enumerate every legal business. No area-wide rate is published (see "Rate
semantics" above). `source_updated_at` is stored as `null` because OA-15577
does not publish it. Transport is HTTP per
the official Seoul endpoint; authenticated URLs and keys are never logged.
The collector deliberately uses one transport attempt per bounded page so a
run cannot silently exceed its five-probe/three-pages-per-area ceiling.

## S4 source correction and contract (2026-09-02)

The originally nominated OA-22379 product is not used. Its published
`PURPOSE_ADMDONG4` foreigner file was downloaded and contract-checked; the
header has origin/destination, time, distance, duration, nationality, age
buckets, total and date, but **no `move_purpose` column**. Shopping or tourism
cannot be derived from that shape without fabrication.

OA-22378 is the same provider's official destination-based foreigner product
and contains the required `move_purpose` field. The official layout/manual
defines purpose `4` as 쇼핑 and `5` as 관광. KORETAIL uses only those two codes
and only the versioned destination-dong mappings: 명동 `11140550`, 홍대/서교동
`11440660`, 성수2가1동 `11200670`. A code may belong to only one product area.

The daily Actions run reads the official metadata page. It downloads the
roughly monthly archive only when the publication id changes, extracts only
the latest daily CSV, aggregates outside Cloudflare, and sends at most six
rows to D1. `SKIPPED_NO_NEW_PUBLICATION` means one metadata request and zero
archive downloads. No raw mobility row or nationality dimension is stored.
Missing area/purpose pairs remain unavailable rather than becoming zero.
Every UI occurrence carries the reference date and calls the values monthly
statistical estimates, never live activity, visitor counts, purchases or
sales. The source uses no secret and adds no Worker Cron.

## S5 station mapping and daily-history contract (2026-09-02)

OA-22723 exposes only the recent seven-day window. KORETAIL therefore performs
one bounded initial backfill of the seven completed KST days, then requests
only the newly completed day. A same-KST-day checkpoint makes a repeated run
zero-call. The initial ceiling is 21 successful provider calls (7 days × 3
selected station codes); a normal daily run is three. Each station/date result
must fit the documented 1,000-row page and match the requested date, exact
station code, station number, station name and line. Hour/card/user rows are
summed outside D1, then discarded. D1 retains only one compact station/day row.

Mapping version: `oa-22723-area-stations-2026-09-02-v1`.

| Area | Included station | OA-22723 code / station no. / line | Why included | Researched candidates not included |
|---|---|---|---|---|
| myeongdong | 명동 | `0424` / `424` / 4호선 | Eponymous station at the conservative product-area centre | 을지로입구 `0202` / `202` / 2호선 is a nearby edge candidate; excluded to avoid silently widening the catchment |
| hongdae | 홍대입구 | `0239` / `239` / 2호선 | Eponymous central station in OA-22723 | 합정 2호선 `0238`, 합정 6호선 `2623`, 상수 `2624` are separate nearby station/line codes; excluded to avoid transfer/edge double counting |
| seongsu | 성수 | `0211` / `211` / 2호선 | Eponymous station in OA-22723 | 서울숲 returned no OA-22723 rows because it is not in this Seoul Metro service coverage; it is never fabricated or substituted |

The official code-filtered sample contract on 2026-09-02 returned the exact
station/name/line combinations above. Transfer-line codes are never merged by
name. The public summary labels the metric as selected-station boarding and
alighting counts, shows the exact reference date and station set, and explicitly
denies real-time, unique-person and commercial-area-visitor interpretations.
An authenticated Production response is the final activation gate.

## S1 integrated population + realtime commercial contract (2026-09-02)

GitHub Actions run `33622942959` executed the manual read-only `PROBE` path
against the Production Seoul secret. It made exactly one request for each of
`POI003`, `POI007`, and `POI068`; all three returned HTTP success,
`INFO-000`, a population array, a commercial object, the required commercial
level/time fields, the category array, and published payment count/range
fields. The probe printed structural booleans only. It received no D1 token,
persisted nothing, and did not print an authenticated URL or any commercial
value.

The recurring collector now uses the same integrated `citydata` response for
both products, so normal request volume remains three calls/run (288/day at 96
runs, up to 576/day with the existing one retry per failed area). Population
keeps source ID `SEOUL_CITYDATA_PPLTN`; domestic-card commercial activity uses
the independent source ID `SEOUL_CITYDATA_CMRCL`. Their parser, changed-only
table, collector run, source health, and partial-failure status are independent
even though they share one transport request.

`LIVE_CMRCL_STTS` is Seoul-published Shinhan Card domestic-consumer activity.
The authenticated response publishes `CMRCL_TIME` as `YYYYMMDD HHmm` in KST;
it is normalized to an explicit `+09:00` timestamp without browser/runtime
timezone inference.
KORETAIL does not label it total sales, POS sales, foreign spend, tourist
spend, or store revenue. Provider-suppressed payment values remain `null`, are
never converted to zero, and do not delete last-good data. Category and
demographic arrays are contract-checked but not retained because this product
slice does not consume them.

`CMRCL_TIME` proves the KST reference minute, not a separately published
interval-start field. The reader-facing card therefore says “reference time +
recent 10 minutes” and never subtracts ten minutes to manufacture an exact
start/end range. Provider status, nullable payment range/count, reference time,
KORETAIL retrieval time, freshness, and domestic-consumer/not-total-sales
attribution remain visually separate in all four locales.

## A4-T2 and A5 — verified contracts (2026-08-30)

**Status: VERIFIED, not blocked.** The 2026-08-30 blocker below (`www.data.go.kr` unreachable from the Claude Code sandbox) is now resolved: the owner read the official 인천국제공항공사 OpenAPI 활용가이드 documents directly (signed in, "Open API" tab) and supplied the exact operation URLs, request/response field tables and revision notes verbatim. This is now the same evidence tier as every other source in the matrix above (CONFIRMED/AUTHENTICATED-equivalent), not a guess or a third-party corroboration. Both are implemented: `lib/source-adapters.ts` (`normalizeAirportCongestionT2`, `normalizeAirportPassengerForecastRow`), `lib/collector.ts` (`collectAirportCongestionT2`, `collectAirportPassengerForecast`), scheduled by `.github/workflows/collect-realtime.yml` (A4-T2, folded into the existing REALTIME group) and `.github/workflows/collect-forecast.yml` (A5, new hourly group). A future agent should not re-open the data.go.kr portal for these two datasets unless the provider changes the contract; this section is the authoritative reference.

### A4-T2 — 출국장 혼잡도 제2여객터미널 조회

- Dataset: `15161098` (`https://www.data.go.kr/data/15161098/openapi.do`).
- Service ID `statusOfDepartureCongestionT2`, operation `getDepartureCongestionT2`.
- Base: `http://apis.data.go.kr/B551177/statusOfDepartureCongestionT2` — full operation URL `.../getDepartureCongestionT2`. REST, XML + JSON (KORETAIL always requests `type=json`).
- Official update frequency: real-time, approximately every 1–2 minutes. KORETAIL polls every ~15 minutes (folded into the existing REALTIME group with A4-T1 + S1) — a deliberately lighter Phase-1 cadence, not an attempt to match the provider's own refresh rate.
- **Request fields**: `serviceKey` (required); `gateId` (optional — documented values `DG1_A`/`DG1_B`/`DG1_C`/`DG1_D` (Departure Gate 1 A–D) and `DG2_A`/`DG2_B`/`DG2_C`/`DG2_D` (Departure Gate 2 A–D); omitted = ALL gates, which is what KORETAIL always does); `type` (optional, xml/json, default xml); `numOfRows` (required); `pageNo` (required); `tmp1`/`tmp2`/`tmp3` (provider-reserved, unused for product semantics).
- **Documented inconsistency — do not copy it**: the guide's own example request uses `gateId=P03`. This is wrong. The guide's own request table defines `gateId` as `DG1_A..DG2_D`, and its response table defines `terminalId=P03` as meaning Terminal 2. So **`P03` is a `terminalId` value, never a valid `gateId`**. KORETAIL's collector never sends `gateId=P03`, and `normalizeAirportCongestionT2` requires `terminalId === "P03"` while treating any `gateId` outside the documented `DG1_A..DG2_D` set as `PARTIAL` quality (stored honestly, not silently accepted as fully verified, not rejected outright in case the provider adds a gate).
- KORETAIL always omits `gateId` to fetch all T2 gates in one request (avoiding 8 unnecessary provider calls); normal cost is ~1 request/collection, `numOfRows=20` (safely above the documented 8-gate sample) with `pageNo=1`, and bounded pagination (max 3 pages) only if `totalCount` ever exceeds one page.
- **Response fields**: `resultCode`/`resultMsg`; `terminalId` (`P03` = Terminal 2); `gateId` (`DG1_A..DG2_D`); `waitTime` (departure-hall wait in minutes — the provider can return `"60+"` for 60 minutes or more); `waitLength` (actual observed waiting-person count); `occurtime` (official observation timestamp); `operatingTime` (gate operating hours); `numOfRows`/`pageNo`/`totalCount`.
- `waitTime` `"60+"` handling: `wait_time_minutes` stays an exact numeric value only when the provider returns a plain integer string. `"60+"` (or any other non-exact form) is preserved honestly in the additive `wait_time_raw` column and is never coerced into a false-exact `60`.
- `occurtime` forms seen in the contract/live shape: `YYYYMMDDHHmm` and `YYYYMMDDHHmmss`, both Incheon Airport local time (KST), never UTC. A malformed timestamp fails that row closed rather than fabricating the current time as the observation time.
- Freshness: the provider documents that it returns the ~1-minute-prior observation, or the most recent available observation if that is unavailable (also possible during infrastructure issues). `occurtime` is the authoritative observation time; `retrievedAt` is never treated as observation time.
- Missing gate data: if a departure gate is not operating, the provider omits that row rather than returning a zero. KORETAIL never fabricates a `waitingCount=0` row for an absent gate.
- Storage: reuses the existing `airport_congestion` table (already has `source_id`/`terminal`/`zone`/`observed_at`) — no second T2 table. Source ID `INCHEON_DEPARTURE_CONGESTION_T2` (distinct from A4-T1's `INCHEON_DEPARTURE_CONGESTION`); `terminal='T2'`; `zone` = official `gateId`; `waitingCount` = `waitLength`; `observedAt` = `occurtime`. T1 and T2 can never overwrite each other because the unique key already includes both `source_id` and `terminal`.
- Official wait-time categories (usable for T2 display, never assumed to apply to A4-T1 unless separately confirmed by that contract): `<20min` 원활, `20–<40` 보통, `40–<60` 혼잡, `>=60` 매우혼잡. KORETAIL never replaces the actual count/minutes with just the category label.

### A5 — 승객예고-출·입국장별 (OpenAPI 활용가이드 V5.0)

- Dataset: `15095066`. Service ID `passgrAnncmt`, operation `getPassgrAnncmt`. Base/operation URL: `http://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt`. REST, XML + JSON (KORETAIL always requests `type=json`).
- **V5.0 field names only.** The guide's own revision history states T1 departure forecast data — previously combined — was split, with response parameter names changed. KORETAIL uses only the V5.0 names supplied by the owner; it does not use any older blog/V4 field names, and does not "correct" a V5.0 name to look more symmetrical (see `t2dgsum2` below).
- **Request fields**: `serviceKey` (required), `numOfRows` (required), `pageNo` (required), `selectdate` (optional — `0`=TODAY, `1`=TOMORROW, default `0`), `type` (optional, xml/json, default xml). KORETAIL queries **both** `selectdate=0` and `selectdate=1` every collection cycle.
- Official data refresh: ~5 minutes. KORETAIL polls once/hour: Cloudflare Cron `42 * * * *` dispatches `.github/workflows/collect-forecast.yml`, which has no competing GitHub schedule. Normal cost ≈2 requests/cycle (today + tomorrow, each usually fitting in one page against the official sample `totalCount=25`) × 24 runs/day ≈ 48 requests/day, with bounded per-day pagination if `totalCount` ever exceeds one page.
- **Recovery window (`53 * * * *` → `collect-forecast-recovery.yml`).** Because the primary runs only once an hour, a provider timeout at `:42` costs the whole hour — on 2026-09-01 the page served a forecast collected at 08:42 at 14:33. The recovery run reads D1 first (`lib/collection-recovery.ts`): a day that is `COMPLETE` across T1+T2 **and** was collected within the last hour is not re-requested, so a recovery after a healthy primary makes **zero** provider requests and reports `SKIPPED_ALREADY_HEALTHY`. Only the missing `selectdate` is fetched, so worst case adds ≤48 requests/day.
- **Response time dimensions**: `adate` (`YYYYMMDD`) and `atime` (hourly interval, e.g. `"09_10"`, `"23_24"`) — an **hour band**, not an instantaneous observation. KORETAIL stores `adate`/`atime` raw plus derived `target_start_at`/`target_end_at` in KST. `"23_24"` resolves to next-day `00:00`, computed via pure KST calendar-date arithmetic (never through a UTC-instant detour, which can silently pick the wrong calendar day) — never an invalid same-day `"24:00"`.
- **T1 departure fields**: `t1dg1`..`t1dg6` (gates 1–6; gate 6 is a mobility-priority exit and is officially excluded from the airport's own expected-congestion target, but KORETAIL still stores it because the API returns it) and `t1dgsum1` (official T1 departure total). KORETAIL never recomputes a "total" by blindly summing every returned field; it prefers the provider's own aggregate field for a terminal total.
- **T1 arrival fields**: `t1eg1` (arrival hall A/B), `t1eg2` (E/F), `t1eg3` (C), `t1eg4` (D), `t1egsum1` (official T1 arrival total). The Seoul business view uses only the official aggregate arrival rows as a compact leading reference signal for consumer demand; it never calls them observed arrivals or Seoul visitors, and the departure-facing Airport view remains separate.
- **T2 departure fields**: `t2dg1`, `t2dg2`, and — **exact official spelling** — `t2dgsum2` (not `t2dgsum1`; the two terminals' aggregate field names are not symmetrical and KORETAIL does not "fix" that).
- **T2 arrival fields**: `t2eg1` (hall A), `t2eg2` (hall B), `t2egsum1` (official T2 arrival total).
- **Numeric safety**: provider samples are non-integral (`706.0`, `861.0`, `2249.0`); KORETAIL stores them as a `real` column preserving source truth, only formatting without a trailing `.0` in the UI. Missing/negative/non-finite values are dropped (not coerced to `0`); an explicit provider `0.0` is preserved as a valid zero.
- **Double-count prevention (critical)**: the response returns both individual facilities (e.g. `t1dg1..t1dg6`) and the official total (`t1dgsum1`) in the same row. `normalizeAirportPassengerForecastRow` expands one provider row into one canonical row per official field and tags every official total field with `is_aggregate=1` (component fields get `is_aggregate=0`). Product summation must use the official aggregate row **or** sum components — never both — and the current API (`/api/live/summary`) uses the official aggregate row directly. Locked in by `tests/airport-t2-forecast.test.mjs`.
- **Arrival display coverage**: the Seoul business view shows the T1+T2 whole-day arrival total and peak only when the existing full-day coverage check is `COMPLETE`. `PARTIAL` coverage hides both. A next-band value is shown only when official T1 and T2 aggregate rows cover the same non-ended interval. This adds no provider request: `/api/live/summary` reads both directions in one bounded indexed D1 query and splits them in memory.
- **Storage**: new additive table `airport_passenger_forecast` (`drizzle/0006_airport_t2_and_passenger_forecast.sql`), never `airport_congestion` — this is FORECAST/EXPECTED data, not an observed queue. Long/normalized shape: `id, source_id, record_origin=FORECAST, terminal, direction, zone, is_aggregate, target_date, time_band_raw, target_start_at, target_end_at, expected_passengers, retrieved_at, schema_version, quality_status, source_hash`. Source ID `INCHEON_PASSENGER_FORECAST`.
- **History**: no code path ever deletes rows from `airport_passenger_forecast`; a forecast collected for a target date that later leaves D+0/D+1 remains queryable. A canonical target-slot row (unique on `source_id, terminal, direction, zone, target_date, time_band_raw`) updates in place via changed-only `source_hash` comparison if the provider revises a forecast before the target hour; `retrieved_at` alone never creates a duplicate.

Both contracts, their idempotency/history/double-count/redaction behavior, and the T1/T2-cannot-collide guarantee are locked in by `tests/airport-t2-forecast.test.mjs` (29 cases) and `tests/migrations.test.mjs`.

## Authentication notes

- data.go.kr issues one 일반 인증키 per account; utilization applications are per-API. Do not tell the owner a second "Decoding key" exists when the account screen shows one key.
- Gateway error code 30 (`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`) can mean an unregistered/malformed key **or** an approved-but-not-yet-propagated utilization application. The shared request builder accepts either portal representation, normalizes it once, and lets `URLSearchParams` perform exactly one transport encoding. It does not try random raw/encoded variants.
- Seoul keys ride in the URL path; smoke/collector code must never log Seoul request URLs.
- TourAPI success code is `"0000"`; KMA/airport success is `"00"` — never share one success check.

### Phase B authentication smoke (2026-08-30 KST)

Workflow run `Smoke Public APIs #19` (`33301206353`, commit `94d00b6`) made one read-only request to each source with a 30-second ceiling and persisted nothing. Shared-gateway diagnostics passed: DNS 991ms, TLS 835ms, and secret-free HTTP TTFB 519ms. All six authenticated requests returned HTTP 200 and their official success codes. Elapsed times were A1 2452ms, A2 2468ms, A3 606ms, A4 1169ms, W1 204ms, and T1 568ms. The prior 10-second aborts were request errors, never authentication failures; the current evidence does not show a gateway or provider outage.

Verified first-record contracts: A1 includes `fid`, `flightId`, `masterFlightId`, `codeshare`, `scheduleDatetime`, `estimatedDatetime`, `terminalId`, `gateNumber`, `chkinRange`, and `remark`; A2 exposes the overlapping flight identity/timing/terminal fields; A3 exposes `season`, `firstdate`, `lastdate`, `st`, weekday flags, flight/master/codeshare, airline, airport and terminal; A4 exposes `gateId`, `occurtime`, `operatingTime`, `terminalId`, `waitLength`, and `waitTime`; W1 and T1 match the documented contracts above. No full payload or credential representation was logged.

### Production transient recovery policy (2026-09-01 KST)

Recent Production runs proved intermittent shared-gateway connection stalls
(`NETWORK_UND_ERR_CONNECT_TIMEOUT`) between successful runs. This is not an
authentication or scheduler classification.

| Source | Healthy calls | Total attempts after transient failure | Delays | Exact worst-case provider calls/day |
|---|---:|---:|---|---:|
| A2 | 1/day | 4 | 2s, 10s, 45s (+≤0.5s jitter) | 4 |
| A3 | 1/day | 4 | same | 4 |
| T1 TourAPI | 1/day | 4 | same | 4 |
| A4-T1 | 96/day | 4 | same | 384 |
| A4-T2 | ~96/day, normally one page; max 3 pages | 3/request | 5s, 30s (+≤0.5s jitter) | 288 normally; 864 absolute bounded maximum |
| W1 | 3 grids × 8 cycles = 24/day (both recovery windows add 0 when healthy) | 3/grid | 5s, 30s (+≤0.5s jitter) | 72 normally; 216 absolute bounded maximum with both recovery windows firing every attempt |

A4 datasets remain under the project's conservative 1,000/day-class separate
dataset budget. W1 remains far below its documented 10,000/day quota. A1's
bounded paged scan, A5, and S1 keep their existing request policies. HTTP 429
`Retry-After` is honored up to 60 seconds. HTTP 400/401/403/404/422, provider
auth codes, successful malformed JSON, schema and deterministic validation
errors do not retry.

Normal healthy provider volume is unchanged. A failed refresh never deletes
or zeroes last-good rows; only source health and collector-run metadata record
the truthful failure and its original data timestamp remains unchanged.

### Temporal self-healing (2026-09-01)

A4 realtime survives a short provider outage because its own next 15-minute
cycle collects again. A5 (hourly) and W1 (once per KMA issuance) have no such
second chance, so a timeout lasting minutes used to cost a whole collection
opportunity. Three recovery windows close that gap:

| source | primary | recovery | dispatches |
| --- | --- | --- | --- |
| A5 | `42 * * * *` | `53 * * * *` | `collect-forecast-recovery.yml` |
| W1 | `10 2,5,8,11,14,17,20,23 * * *` | `25,40 2,5,8,11,14,17,20,23 * * *` | `collect-weather-recovery.yml` |

W1 gets both recovery windows first sketched, :25 and :40, without a sixth
trigger. Workers Free caps Cron Triggers at **5 per account** and these five
fill it — a sixth is rejected by the Cloudflare API (code 10072) and fails the
deploy. What the cap counts is *configured expressions*, and Cloudflare's cron
syntax gives the minute field as 0-59 with `* , - /`, so
`25,40 2,5,8,11,14,17,20,23 * * *` is one expression that fires at both
minutes. Healthy issuances still cost zero extra provider requests, because
each window reads D1 before it decides to call KMA.

Recomputed for the second window, from `KMA_GRID_RETRY_POLICY` (`maxAttempts:
3`) and `uniqueKmaGrids()` (3 cells) rather than from the old two-window math:

| | |
| --- | --- |
| KMA issuances/day | 8 (`2,5,8,11,14,17,20,23` UTC) |
| Grids per issuance | 3 |
| Healthy provider requests/day | **24** — the :10 primary only; both recovery windows return `SKIPPED_ALREADY_HEALTHY` with `providerRequests=0` |
| Recovery dispatches/day | 16 (8 issuances × 2 minutes), all GitHub, none reaching KMA when healthy |
| Worst-case provider requests/day | **216** — 3 grids × 3 attempts × 3 windows × 8 issuances, every attempt failing |
| Share of the documented 10,000/day quota | 0.24 % healthy, 2.16 % worst case |

Adding :40 therefore does not multiply provider load. It changes only the
worst case, from 144 to 216, and only on a day where KMA is failing every
attempt in every window — which is the day the extra window exists for.

A recovery run is not a repeat of the primary. It reads Production D1 first
(`lib/collection-recovery.ts`) and then:

- **already healthy** → zero provider requests, status `SKIPPED_ALREADY_HEALTHY`
- **partly missing** → only the missing A5 `selectdate` / the missing KMA grid
- **fully missing** → the same cost as one primary cycle, never more

Health semantics are correspondingly truthful: `LIVE` when the required
coverage was collected, `STALE` when this attempt failed or was incomplete but
usable stored rows remain, `ERROR` when nothing usable is stored or the failure
is permanent (auth/schema). A partial collection is never written as `LIVE`.
Each run logs `mode`, `providerRequests`, the missing targets, the resulting
`sourceHealth` and `lastGoodPreserved`, all secret-free.

**Health is read back, not inferred (2026-09-01).** It used to be derived from
whether a day's request threw, which is a different question from whether today
and tomorrow are actually covered: production run 33478751045 collected 48 row
groups, reported `PARTIAL`, and still wrote `LIVE`. `readRequiredForecastCoverage`
now re-reads the stored rows after writing and judges them by the same
completeness contract the product uses, so `LIVE` means the required coverage
exists.

**"Current" comes from `source_health.last_retrieved_at`, never from row
`retrieved_at`.** A5 writes are changed-only, so re-collecting an unchanged
forecast leaves every row stamped with the moment the value last moved. Judging
freshness from rows made a successful re-collection look permanently stale, and
that is why the `:53` window re-requested both days every hour instead of
skipping. The source-level stamp advances on every successful collection, so
one rule now serves both the collector and the recovery planner.

**The one non-band row A5 always returns is a drop, not a failure.** The
provider returns exactly one row per request whose `adate` is not a date
(`SCHEMA_A5_ADATE_FORMAT`); it is not an hourly band and rejecting it is
correct, so validation is unchanged. Counting it as a collection failure is
what made every run `PARTIAL` forever. One such drop per request is expected;
anything beyond that still surfaces. The rejected field is logged as a bounded
shape (`adate string:hangul:len1_4`) so it stays diagnosable without printing a
payload.

A5 recovery fires at `:53`, not the `:52` first proposed, because the realtime
cadence already fires at `:52` and two trigger expressions matching one minute
is a routing ambiguity; the realtime cadence itself is unchanged.

## Source lifecycle

Raw adapter → schema validation → canonical normalizer → D1 → internal API → UI. Canonical records store source, record origin, event time, publication/availability time, retrieval time, freshness, schema version, quality status and a source hash. The frontend never receives an official service key and never calls a government API directly.

## Failure behavior

`LIVE`, `STALE`, `MISSING`, `DEGRADED`, `ERROR`, `OFFICIAL_HISTORICAL`, and `DEMO` are distinct. A last-good record may remain visible only with its original timestamp and a STALE label. Missing terminal data is N/A; it is never copied from the all-airport value. Each source fails independently; one blocked provider must never break the public site.

## Airline ranking and airline country reference (2026-09-03)

The airline ranking on the airport page is derived from the same A1
physical-departure rows that feed the busiest-gate ranking
(`lib/airline-ranking.ts`, pure). One physical flight counts once; the
operating airline is the two-character designator at the start of the
operating (master) flight number, so a codeshare marketing number never
creates a second flight or credits the marketing partner.

**The displayed airline name comes only from the reference table below,
keyed by that designator — never from the raw per-row `airport_flights
.airline_code` field.** That field was the primary label until 2026-09-03,
when production showed KE-numbered flights labelled "아시아나항공" and
OZ-numbered flights labelled "대한항공" — swapped. Root cause:
`airport_flights` keeps exactly one row per physical flight (unique index
on `physical_flight_id`); when a provider page lists a codeshare pair under
the same master flight number, `persistTodayFlights`'s upsert keeps
whichever marketing row it saw last, including that row's own raw
`airline` text — which can be the codeshare PARTNER's name, unrelated to
the airline the flight number actually names. The country was already
registry-only and stayed correct throughout; the name is now registry-only
too, for the same reason. A designator the reference table cannot vouch
for shows no name (not the raw label) — worse to show a name that might be
wrong than to show none.

Airline **country** is NOT provided by any official source we can reach.
It comes from a reference table (`lib/airline-registry.ts`) generated by
`scripts/build-airline-registry.mjs` from the OpenFlights airline and country
snapshots (https://openflights.org/data.php, Open Database License 1.0,
retrieved 2026-09-03; file hashes are in the generated header). Rules:

- only active airlines with a two-character IATA designator; a designator
  held by several active airlines is kept only when every one resolves to
  the same country, otherwise it is excluded;
- the snapshot is community-maintained and lags re-assigned designators.
  `lib/airline-country.ts` therefore carries an explicit **suppression
  table** of designators whose snapshot row is a former holder of the code
  (e.g. `RS`, `VJ`, `RF`); those airlines are shown as **국적 미확인 /
  country unverified**. Suppression withholds; it never substitutes a
  replacement country;
- the UI states the provenance under the ranking, and the summary payload
  carries `airlineRanking.countrySource` (provider, licence, retrievedOn,
  entries, suppressed) so the basis is visible in the API too.

Owner upgrade path: verify the airlines actually operating at ICN against
an official register (MOLIT 항공정보포털 or the 인천국제공항공사 취항항공사
dataset) and either remove designators from the suppression table or replace
the reference table with the official one. Until then, `countryBasis:
"UNVERIFIED"` rows must not be read as a nationality.

## A1 daily recovery window (2026-09-03)

`collect-airport-recovery.yml` (10:07 KST) is the daily A1 counterpart of
the A5 hourly recovery. It runs `airport_recent` then `airport_enrichment`.
`airport_recent` reads `collector_runs` first: a COMPLETE scan already
recorded for today's KST date → `SKIPPED_ALREADY_COMPLETE_TODAY` with zero
provider requests. Only a day whose 06:07 primary failed (the 2026-09-03
scheduled run lost every data.go.kr source to `UND_ERR_CONNECT_TIMEOUT`)
pays for a second scan. The scan now counts every request it issues
(`requestsIssued`, recorded in the run detail) and aborts before exceeding
`RPK_A1_MAX_REQUESTS`; the recovery window uses 200 so primary (≤300) plus
recovery can never exceed A1's documented 500 calls/day.

## Deduplication rule (A1 vs A2)

A1 and A2 returned the same total count (`11,745`) in the same bounded run and share `fid`, `flightId`, `masterFlightId`, `codeshare`, scheduled/estimated time, airport and terminal fields. Decision: **A1_PRIMARY_A2_ENRICHMENT**. A1 owns current physical-flight rows. A2 may fill missing shared metadata and records independent source health, but never inserts a parallel flight row. Physical identity uses direction + service date + master/operating flight + scheduled time; changed time and retrieval time do not create a second aircraft.

## S2 series transition

The dong-level 단기체류외국인 생활인구 series (OA-14993 family) stopped being updated after the 2026-06-09 portal reorganization notice; the successor is the 250M-grid product. The bundled UI history (2025-01 – 2026-07 monthly dong aggregates) remains labelled `OFFICIAL_HISTORICAL` with its original scope note. New grid data must be stored as a separate series with its own spatial unit; never splice it into the legacy dong series.

### Successor dataset IDs (read from the official catalog 2026-08-28)

Resolved from `data.seoul.go.kr` dataset pages by the bounded 2026-08-28 research probe. The production branch no longer carries that 629-line discovery script because the service name is now known. The IDs and titles are CONFIRMED.

| Dataset | Title | Publishes an OpenAPI? |
|---|---|---|
| `OA-23018` | [단기외국인] 행정동별 서울 생활인구(250m) | **Yes** — real parameter list |
| `OA-22786` | [단기외국인] 서울 생활인구(250m) | No |
| `OA-22894` | [단기외국인] 서울 체류인구(250m) | No |
| `OA-22785` | [장기외국인] 서울 생활인구(250m) | No |
| `OA-23017` / `OA-22893` | 장기외국인 equivalents | not probed |

Evidence: `POST /together/mypage/getReqParam.do {infId}` returns `{"paramList":[…],"filterList":[]}` for `OA-23018` and `{"paramList":[],"filterList":[]}` for the other three. So the pure 250m-grid products are file/sheet distributions, and the **dong-aggregated `OA-23018` is the only short-stay foreign successor with an API** — which also happens to be the spatial unit the legacy series used and the one the three target areas need.

`OA-23018` request parameters (official, from that response): `YMD` (일자), `TT` (시간), `H_DNG_CD` (행정동코드) — all `STRING(선택)`, base URL `http://openAPI.seoul.go.kr:8088`. Note these differ from the legacy column names (`STDR_DE_ID` / `TMZON_PD_SE` / `ADSTRD_CODE_SE`), so this is a new service family, not a renamed old one.

`생활인구` and `체류인구` are different official measures. Do not treat them as one series.

The owner read the official Open API sample URL on the OA-23018 portal page and confirmed the exact service name: **`Spop250mFornTempDong`**. Code and diagnostics must use this exact mixed-case value and must not resume service-name discovery.

### Portal transport map (2026-08-28)

Established by probe, useful for any future dataset:

| Endpoint | Method | Returns |
|---|---|---|
| `/dataList/datasetList.do` | GET/POST | client-rendered shell; search term never reaches the server |
| `/dataList/{OA-id}/S/1/datasetView.do` | GET | dataset page; related-dataset IDs and titles only |
| `/dataList/openApiView.do` | **POST** `infId,srvType,serviceKind` | the OpenAPI tab (path form `/dataList/{id}/S/1/openApiView.do` 404s) |
| `/together/mypage/getReqParam.do` | **POST** `infId` | JSON parameter spec — the one endpoint that reliably answers |
| `/dataList/getOpenApiSample.do` | POST/GET | 980-byte error page (POST, 4 parameter shapes) / 1-byte body (GET) — needs a session or token this probe cannot supply |

### Authenticated probe status (2026-08-28)

- `SPOP_LOCAL_RESD_DONG` returned `INFO-000`, 630,988 rows, `STDR_DE_ID=20260731` — the **domestic** dong living-population service is live.
- Every guessed foreign variant (`SPOP_FORN_RESD_DONG`, `SPOP_TEMP_FORN_RESD_DONG`, `SPOP_LONG_FORN_RESD_DONG`, four `_GRID` forms) returned `ERROR-500 서버 오류입니다`.
- **`ERROR-500` carries no information about discontinuation.** A deliberately nonexistent control name (`KORETAIL_CONTROL_NO_SUCH_SERVICE`) returns the identical `ERROR-500`; the run reports `foreignCodeInterpretation=INDISTINGUISHABLE_FROM_UNKNOWN_SERVICE_NAME`. Those seven names are simply not known service names — none of it is evidence that a series ended.
- Consequence: the "dong-level foreign series stopped updating" claim rests on the 2026-06-09 portal notice **alone**. Do not cite the ERROR-500 responses as corroboration.

### Authenticated S2 contract and area mapping (2026-08-29)

One bounded GitHub Actions smoke run returned JSON, `INFO-000`, five rows. The exact row fields are `YMD`, `TT`, `H_DNG_CD`, `SPOP`, `CAN`, `CHN`, `ETC`, `FRA`, `IDN`, `IND`, `JPN`, `KAZ`, `KHM`, `LKA`, `MNG`, `NPL`, `PAK`, `PHL`, `RUS`, `THA`, `USA`, `UZB`, and `VNM`. The response does not contain a dong name, gender, or age. Record identity is `YMD + TT + H_DNG_CD`; `SPOP` is the official total, while nationality fields are retained as nullable dimensions and are never summed back into that total.

The code source is the official data.go.kr file dataset [15136368 법정동 연계정보](https://www.data.go.kr/data/15136368/fileData.do), dated 2025-06-02. Its 10-digit `행정동코드` is converted to the eight-digit S2 `H_DNG_CD` by removing the final two zeros. The product-area choice is cross-checked against the Seoul commercial-area documents: the official [trade-area list](https://golmok.seoul.go.kr/images/seoul_v4.pdf) assigns `3110131 성수동카페거리` to 성수2가1동, and the official [administrative-dong code list](https://golmok.seoul.go.kr/images/adstrd_code.pdf) identifies that dong as `11200670`. Mapping version: `official-admin-dong-2025-06-02-v1`.

The one-shot collector does not assume that an unfiltered API row is newest. OA-23018 documents a daily refresh, hourly `00`–`23` rows in the official file, and a recent-two-month OpenAPI window, but not a guaranteed row order or exact availability lag. The collector therefore checks `23:00` newest-first across a bounded 62 completed KST days and accepts only a period containing exactly one row for every configured dong.

OA-23018 masks nationality counts of three people or fewer as `*`. KORETAIL preserves those masked optional dimensions as `null`; it does not coerce them to zero or add them back into the official `SPOP` total.

| KORETAIL area | Official administrative dong | S2 `H_DNG_CD` | Scope note |
|---|---|---:|---|
| myeongdong | 명동 | `11140550` | Canonical 명동 area |
| hongdae | 서교동 | `11440660` | Canonical 홍대 center |
| seongsu | 성수2가1동 | `11200670` | Official dong assigned to the configured `3110131 성수동카페거리` trade area; no claim that this covers all of 성수 |

These are representative product-area mappings, not interchangeable polygons. The product does not broaden or merge them without new authoritative spatial evidence.

### S2 activation gate

The service name, authenticated response contract, mappings, idempotent D1 persistence, internal API and four-locale UI are complete. Production one-shot `seoul_foreign` succeeded with 18 changed rows; it remains delayed official data, not real-time tourism counts.

The prepared airport schedule is 12 calls/day and at most 24 with its single retry, below the listed 500-call development quota. This is a quota calculation, not proof of a successful approved-key response.
