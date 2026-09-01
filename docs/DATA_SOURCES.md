# Data Sources

Last verified: 2026-08-30 KST. Recheck official terms immediately before activating Production. The contract details below were verified against official portal documentation snippets and cross-checked working integrations; anything marked `UNVERIFIED` still needs one authenticated response before activation. A4-T2 and A5 were verified 2026-08-30 KST directly from the owner-supplied official Incheon International Airport Corporation OpenAPI 활용가이드 (not re-derived or guessed by an agent) — see §"A4-T2 and A5 — verified contracts" below.

## Eleven-source integration matrix

| # | Source | Provider / dataset | Endpoint (verified level) | Key | Truth boundary |
|---|---|---|---|---|---|
| A1 | Airport detailed flight status | 인천국제공항공사 · data.go.kr 15140153 | `apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp` (CONFIRMED; arrivals operation name UNVERIFIED) | `DATA_GO_KR_SERVICE_KEY` | Flights ≠ passengers ≠ shoppers |
| A2 | Duty-free actual flights | data.go.kr 15134279 | `apis.data.go.kr/B551177/statusOfAPaxFlt4DutyFree/getAPaxFlt4DutyFreeDepartures` (AUTHENTICATED) | same | Same physical-flight population as A1 in the bounded check; A1 primary, A2 enrichment/validation only |
| A3 | Duty-free scheduled flights | data.go.kr 15134281 | `apis.data.go.kr/B551177/statusOfSPaxFlt4DutyFree/getSPaxFlt4DutyFreeDepartures` (AUTHENTICATED) | same | Scheduled ≠ actual observed flight; separate D1 model |
| A4-T1 | Departure-hall congestion, T1 | data.go.kr 15148225 | `apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion` (AUTHENTICATED) · `terminalId` P01=T1 only · fields `gateId`, `waitTime`, `waitLength`, `occurtime`, `operatingTime` | same | Checkpoint waits ≠ duty-free visitors ≠ sales |
| A4-T2 | Departure-hall congestion, T2 | 인천국제공항공사 · data.go.kr 15161098 | `apis.data.go.kr/B551177/statusOfDepartureCongestionT2/getDepartureCongestionT2` (VERIFIED, owner-supplied official guide) · see contract detail below | `DATA_GO_KR_SERVICE_KEY` | Checkpoint waits ≠ duty-free visitors ≠ sales; genuinely separate dataset from A4-T1, never a `terminalId` value on it |
| A5 | T1/T2 arrival/departure passenger forecast | 인천국제공항공사 · data.go.kr 15095066 (OpenAPI 활용가이드 V5.0) | `apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt` (VERIFIED, owner-supplied official guide) · see contract detail below | `DATA_GO_KR_SERVICE_KEY` | FORECAST/EXPECTED passengers ≠ actual observed queue; never written to `airport_congestion` |
| S1 | Seoul real-time city data | 서울 열린데이터광장 OA-21285/OA-21778 | `openapi.seoul.go.kr:8088/{KEY}/json/citydata_ppltn/1/5/{POI}` (CONFIRMED) · POI003 명동 관광특구 · POI007 홍대 관광특구 · POI068 성수카페거리 · success key `"SeoulRtd.citydata_ppltn"` + `RESULT["RESULT.CODE"]="INFO-000"` (error envelope uses undotted `RESULT.CODE`) · congestion labels 여유/보통/약간 붐빔/붐빔 · `FCST_PPLTN` = 12 hourly forecasts · ~5-min updates · assume ~1,000 calls/day-class quota | `SEOUL_OPEN_DATA_KEY` | Live population ≠ foreign tourists ≠ shoppers |
| S2 | Short-stay foreign living population | 서울 OA-23018 `[단기외국인] 행정동별 서울 생활인구(250m)` | `openapi.seoul.go.kr:8088/{KEY}/json/Spop250mFornTempDong/1/5/` (authenticated `INFO-000`, 5 rows, 2026-08-29) · optional filters `YMD`, `TT`, `H_DNG_CD` | `SEOUL_OPEN_DATA_KEY` | `SPOP` is the total; nationality columns are dimensions and must not be added to it. Short-stay foreign living population ≠ stay population ≠ tourist ≠ shopper ≠ sales |
| S3 | Estimated commercial sales | 서울시 상권분석서비스(추정매출-상권) OA-15572 | `openapi.seoul.go.kr:8088/{KEY}/json/VwsmTrdarSelngQq/{start}/{end}/{STDR_YYQU_CD}` (CONFIRMED; live verification 2026-08-27 showed only the quarter positional filter applies — trade-area segments are ignored, so the collector sweeps the quarter in 1000-row pages and filters client-side) · quarterly 20211–20261 · fields `THSMON_SELNG_AMT/CO` + weekday/time/gender/age splits · trade areas: 명동 3001492(관광특구)·3120028(명동거리)·3120027(명동역), 홍대 3120103(홍대입구역)·3120102(서교동)·3120104(연남동), 성수 3110131(성수동카페거리)·3120052(성수역) | same Seoul key | 추정매출 = modelled estimate, NOT live POS sales, NOT foreign spend |
| W1 | KMA short-term forecast | 기상청 · data.go.kr 15084084 | `apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` (CONFIRMED) · issued 02/05/08/11/14/17/20/23 KST (+~10min) · grids: 명동 (60,127) · 홍대/서교동 (59,126) · 성수 (61,126) · 인천공항/운서동 (51,125) · categories POP/PTY/PCP/REH/SKY/TMP/TMN/TMX/WSD… · `PCP`/`SNO` are strings ("강수없음", "1.0mm 미만") · SKY 1=맑음 3=구름많음 4=흐림 · resultCode "00"=OK, "03"=NO_DATA · 10,000 calls/day dev | `DATA_GO_KR_SERVICE_KEY` | Forecast ≠ observation; issue time ≠ target time |
| T1 | Tourism events (TourAPI) | 한국관광공사 B551011 · KorService2 (KorService1 shut off ~2025-08) | `apis.data.go.kr/B551011/KorService2/searchFestival2` (CONFIRMED) · `eventStartDate` required · `locationBasedList2` (mapX/mapY/radius≤20000, contentTypeId=15, `dist` in response) for area mapping · success resultCode "0000" · v4.4 deprecates `areaCode`/`sigunguCode` in favor of `lDongRegnCd=11`(서울)/`lDongSignguCd` · 1,000 calls/day dev | same data.go.kr key | Event existence ≠ attendance ≠ demand ≠ sales |

No paid API, paid data, paid fallback or runtime LLM is approved. A source without verified commercial and automated-use terms remains disabled.

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
- **T1 arrival fields**: `t1eg1` (arrival hall A/B), `t1eg2` (E/F), `t1eg3` (C), `t1eg4` (D), `t1egsum1` (official T1 arrival total). Stored because the API returns them, but the departure-facing product UI does not mix arrival and departure passengers.
- **T2 departure fields**: `t2dg1`, `t2dg2`, and — **exact official spelling** — `t2dgsum2` (not `t2dgsum1`; the two terminals' aggregate field names are not symmetrical and KORETAIL does not "fix" that).
- **T2 arrival fields**: `t2eg1` (hall A), `t2eg2` (hall B), `t2egsum1` (official T2 arrival total).
- **Numeric safety**: provider samples are non-integral (`706.0`, `861.0`, `2249.0`); KORETAIL stores them as a `real` column preserving source truth, only formatting without a trailing `.0` in the UI. Missing/negative/non-finite values are dropped (not coerced to `0`); an explicit provider `0.0` is preserved as a valid zero.
- **Double-count prevention (critical)**: the response returns both individual facilities (e.g. `t1dg1..t1dg6`) and the official total (`t1dgsum1`) in the same row. `normalizeAirportPassengerForecastRow` expands one provider row into one canonical row per official field and tags every official total field with `is_aggregate=1` (component fields get `is_aggregate=0`). Product summation must use the official aggregate row **or** sum components — never both — and the current API (`/api/live/summary`) uses the official aggregate row directly. Locked in by `tests/airport-t2-forecast.test.mjs`.
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
| W1 | 3 grids × 8 cycles = 24/day (the recovery window adds 0 when healthy) | 3/grid | 5s, 30s (+≤0.5s jitter) | 72 normally; 144 absolute bounded maximum with the recovery window firing |

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
| W1 | `10 2,5,8,11,14,17,20,23 * * *` | `25 2,5,8,11,14,17,20,23 * * *` | `collect-weather-recovery.yml` |

W1 gets one recovery window rather than the two first sketched: Workers Free
caps Cron Triggers at **5 per account** and these five fill it. A sixth is
rejected by the Cloudflare API (code 10072) and fails the deploy, so the only
conditional window in the plan is the one that goes.

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
