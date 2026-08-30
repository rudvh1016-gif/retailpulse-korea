# Data Sources

Last verified: 2026-08-30 KST. Recheck official terms immediately before activating Production. The contract details below were verified against official portal documentation snippets and cross-checked working integrations; anything marked `UNVERIFIED` still needs one authenticated response before activation.

## Nine-source integration matrix

| # | Source | Provider / dataset | Endpoint (verified level) | Key | Truth boundary |
|---|---|---|---|---|---|
| A1 | Airport detailed flight status | 인천국제공항공사 · data.go.kr 15140153 | `apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp` (CONFIRMED; arrivals operation name UNVERIFIED) | `DATA_GO_KR_SERVICE_KEY` | Flights ≠ passengers ≠ shoppers |
| A2 | Duty-free actual flights | data.go.kr 15134279 | `apis.data.go.kr/B551177/statusOfAPaxFlt4DutyFree/getAPaxFlt4DutyFreeDepartures` (AUTHENTICATED) | same | Same physical-flight population as A1 in the bounded check; A1 primary, A2 enrichment/validation only |
| A3 | Duty-free scheduled flights | data.go.kr 15134281 | `apis.data.go.kr/B551177/statusOfSPaxFlt4DutyFree/getSPaxFlt4DutyFreeDepartures` (AUTHENTICATED) | same | Scheduled ≠ actual observed flight; separate D1 model |
| A4 | Departure-hall congestion | data.go.kr 15148225 | `apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion` (AUTHENTICATED) · `terminalId` P01=T1 only; provider says T2 is future work · fields `gateId`, `waitTime`, `waitLength`, `occurtime`, `operatingTime` | same | Checkpoint waits ≠ duty-free visitors ≠ sales |
| S1 | Seoul real-time city data | 서울 열린데이터광장 OA-21285/OA-21778 | `openapi.seoul.go.kr:8088/{KEY}/json/citydata_ppltn/1/5/{POI}` (CONFIRMED) · POI003 명동 관광특구 · POI007 홍대 관광특구 · POI068 성수카페거리 · success key `"SeoulRtd.citydata_ppltn"` + `RESULT["RESULT.CODE"]="INFO-000"` (error envelope uses undotted `RESULT.CODE`) · congestion labels 여유/보통/약간 붐빔/붐빔 · `FCST_PPLTN` = 12 hourly forecasts · ~5-min updates · assume ~1,000 calls/day-class quota | `SEOUL_OPEN_DATA_KEY` | Live population ≠ foreign tourists ≠ shoppers |
| S2 | Short-stay foreign living population | 서울 OA-23018 `[단기외국인] 행정동별 서울 생활인구(250m)` | `openapi.seoul.go.kr:8088/{KEY}/json/Spop250mFornTempDong/1/5/` (authenticated `INFO-000`, 5 rows, 2026-08-29) · optional filters `YMD`, `TT`, `H_DNG_CD` | `SEOUL_OPEN_DATA_KEY` | `SPOP` is the total; nationality columns are dimensions and must not be added to it. Short-stay foreign living population ≠ stay population ≠ tourist ≠ shopper ≠ sales |
| S3 | Estimated commercial sales | 서울시 상권분석서비스(추정매출-상권) OA-15572 | `openapi.seoul.go.kr:8088/{KEY}/json/VwsmTrdarSelngQq/{start}/{end}/{STDR_YYQU_CD}` (CONFIRMED; live verification 2026-08-27 showed only the quarter positional filter applies — trade-area segments are ignored, so the collector sweeps the quarter in 1000-row pages and filters client-side) · quarterly 20211–20261 · fields `THSMON_SELNG_AMT/CO` + weekday/time/gender/age splits · trade areas: 명동 3001492(관광특구)·3120028(명동거리)·3120027(명동역), 홍대 3120103(홍대입구역)·3120102(서교동)·3120104(연남동), 성수 3110131(성수동카페거리)·3120052(성수역) | same Seoul key | 추정매출 = modelled estimate, NOT live POS sales, NOT foreign spend |
| W1 | KMA short-term forecast | 기상청 · data.go.kr 15084084 | `apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` (CONFIRMED) · issued 02/05/08/11/14/17/20/23 KST (+~10min) · grids: 명동 (60,127) · 홍대/서교동 (59,126) · 성수 (61,126) · 인천공항/운서동 (51,125) · categories POP/PTY/PCP/REH/SKY/TMP/TMN/TMX/WSD… · `PCP`/`SNO` are strings ("강수없음", "1.0mm 미만") · SKY 1=맑음 3=구름많음 4=흐림 · resultCode "00"=OK, "03"=NO_DATA · 10,000 calls/day dev | `DATA_GO_KR_SERVICE_KEY` | Forecast ≠ observation; issue time ≠ target time |
| T1 | Tourism events (TourAPI) | 한국관광공사 B551011 · KorService2 (KorService1 shut off ~2025-08) | `apis.data.go.kr/B551011/KorService2/searchFestival2` (CONFIRMED) · `eventStartDate` required · `locationBasedList2` (mapX/mapY/radius≤20000, contentTypeId=15, `dist` in response) for area mapping · success resultCode "0000" · v4.4 deprecates `areaCode`/`sigunguCode` in favor of `lDongRegnCd=11`(서울)/`lDongSignguCd` · 1,000 calls/day dev | same data.go.kr key | Event existence ≠ attendance ≠ demand ≠ sales |

No paid API, paid data, paid fallback or runtime LLM is approved. A source without verified commercial and automated-use terms remains disabled.

## A4-T2 and A5 — approved but contract-unverified (2026-08-30)

The owner approved two additional official Incheon Airport Corporation utilization requests:

| # | Source | Official title | Dataset | Meaning |
|---|---|---|---|---|
| A4-T2 | T2 departure-hall congestion | 인천국제공항공사_출국장 혼잡도_제2여객터미널 조회 | `15161098` (`https://www.data.go.kr/data/15161098/openapi.do`) | Current/observed T2 departure-hall waiting, separate from A4-T1's existing `15148225` |
| A5 | T1/T2 passenger forecast | 인천국제공항공사_승객예고-출·입국장별 | `15095066` (`https://www.data.go.kr/data/15095066/openapi.do`) | Official expected-passenger counts by hour for today/tomorrow, T1+T2, arrival/departure halls |

**A4-T2 is a genuinely separate dataset from A4-T1**, not a `terminalId` value on the existing `15148225` endpoint. Do not query `terminalId=P03` against the A4-T1 endpoint as a substitute; the older T1 page's "T2 will be provided later" wording does not apply once this separate dataset is integrated.

### Dataset-ID verification (CONFIRMED, independent corroboration)

`www.data.go.kr` cannot be reached from the Claude Code sandbox that did this work: `WebFetch` returns `EGRESS_BLOCKED`, and a direct `curl` through the configured egress proxy fails with `CONNECT tunnel failed, response 403` / `connect_rejected (organization policy)`. The same block applies to `odp.airport.kr` (Incheon Airport Corporation's own API portal) and `velog.io`. This is an environment-level network policy, not a provider outage.

Because the primary source could not be read directly, the dataset ID `15161098` for A4-T2 was cross-checked against an independent, recently-crawled public catalog: `JunsikChoi/korea-cli` (`docs/api-catalog/by-org/인천국제공항공사.md`, committed 2026-08-29) lists an entry titled exactly `인천국제공항공사_출국장 혼잡도_제2여객터미널 조회` at `data.go.kr/data/15161098/openapi.do`, with a Korean description matching the A4-T1 shape (gate number grouped A/B/C/D, checkpoint 1–2, occurrence time, waiting-person count, terminal fixed to T2). This is treated as **CONFIRMED** dataset-ID evidence (independent source, exact title match, freshly crawled), not as a REST contract.

### REST contract — BLOCKED, not guessed

The exact operation path (e.g. `apis.data.go.kr/B551177/.../getXxx`), request parameter names, and JSON response field names for both A4-T2 and A5 remain **UNVERIFIED**. Neither WebSearch, GitHub code search, nor the two independent repositories found while researching this (`JunsikChoi/korea-cli`, `DongsooJung/dongsoojung.github.io`) publish the actual data.go.kr operation contract:

- `DongsooJung/dongsoojung.github.io` (`scripts/update-airport-congestion.mjs`) calls the airport's own public website (`www.airport.kr/pgn/ap_ko/passengerNoticeApiData.do`, `.../ap_ko/883/subview.do`) with an HTML/JSON scrape, not the authenticated `apis.data.go.kr` gateway. It corroborates that T1/T2 checkpoint waiting and T1/T2 hourly forecast data both exist as distinct queryable dimensions, but it is not the official contract and must not be transplanted into the collector per the owner's explicit instruction not to invent an endpoint.

Per `docs/ENGINEERING_DIRECTION.md` §6 ("real HTTP contract check" before implementation) and the owner's explicit instruction not to invent a dataset ID or REST endpoint, **no A4-T2 or A5 collector was implemented** in this work. This is a genuine external blocker, not a skipped step.

**Owner action required to unblock:** open each page's "Open API" tab while signed in —

- `https://www.data.go.kr/data/15161098/openapi.do`
- `https://www.data.go.kr/data/15095066/openapi.do`

— and paste the exact 요청주소 (request URL / operation name), the full request-parameter table (name, required/optional, sample value), and one sample response JSON block for each. Once that is available, the collector, schema, tests, schedule and UI work in this document's plan can proceed using the same pattern as A1–A4/S1–S3/W1/T1.

## Authentication notes

- data.go.kr issues one 일반 인증키 per account; utilization applications are per-API. Do not tell the owner a second "Decoding key" exists when the account screen shows one key.
- Gateway error code 30 (`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`) can mean an unregistered/malformed key **or** an approved-but-not-yet-propagated utilization application. The shared request builder accepts either portal representation, normalizes it once, and lets `URLSearchParams` perform exactly one transport encoding. It does not try random raw/encoded variants.
- Seoul keys ride in the URL path; smoke/collector code must never log Seoul request URLs.
- TourAPI success code is `"0000"`; KMA/airport success is `"00"` — never share one success check.

### Phase B authentication smoke (2026-08-30 KST)

Workflow run `Smoke Public APIs #19` (`33301206353`, commit `94d00b6`) made one read-only request to each source with a 30-second ceiling and persisted nothing. Shared-gateway diagnostics passed: DNS 991ms, TLS 835ms, and secret-free HTTP TTFB 519ms. All six authenticated requests returned HTTP 200 and their official success codes. Elapsed times were A1 2452ms, A2 2468ms, A3 606ms, A4 1169ms, W1 204ms, and T1 568ms. The prior 10-second aborts were request errors, never authentication failures; the current evidence does not show a gateway or provider outage.

Verified first-record contracts: A1 includes `fid`, `flightId`, `masterFlightId`, `codeshare`, `scheduleDatetime`, `estimatedDatetime`, `terminalId`, `gateNumber`, `chkinRange`, and `remark`; A2 exposes the overlapping flight identity/timing/terminal fields; A3 exposes `season`, `firstdate`, `lastdate`, `st`, weekday flags, flight/master/codeshare, airline, airport and terminal; A4 exposes `gateId`, `occurtime`, `operatingTime`, `terminalId`, `waitLength`, and `waitTime`; W1 and T1 match the documented contracts above. No full payload or credential representation was logged.

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
