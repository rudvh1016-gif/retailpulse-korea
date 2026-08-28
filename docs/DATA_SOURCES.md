# Data Sources

Last verified: 2026-08-27 KST. Recheck official terms immediately before activating Production. The contract details below were verified against official portal documentation snippets and cross-checked working integrations on 2026-08-27; anything marked `UNVERIFIED` still needs one authenticated response before activation.

## Nine-source integration matrix

| # | Source | Provider / dataset | Endpoint (verified level) | Key | Truth boundary |
|---|---|---|---|---|---|
| A1 | Airport detailed flight status | 인천국제공항공사 · data.go.kr 15140153 | `apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp` (CONFIRMED; arrivals operation name UNVERIFIED) | `DATA_GO_KR_SERVICE_KEY` | Flights ≠ passengers ≠ shoppers |
| A2 | Duty-free actual flights | data.go.kr 15134279 | `apis.data.go.kr/B551177/statusOfAPaxFlt4DutyFree/…` (path UNVERIFIED — needs authenticated probe) | same | Same as A1; candidate duplicate of A1 |
| A3 | Duty-free scheduled flights | data.go.kr 15134281 | `apis.data.go.kr/B551177/statusOfSPaxFlt4DutyFree/…` (path UNVERIFIED) | same | Scheduled ≠ actual observed flight |
| A4 | Departure-hall congestion | data.go.kr 15148225 | `apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion` (CONFIRMED) · `terminalId` P01=T1 / P03=T2 (T2 row presence unproven) · fields `gateId(DG1_E…DG6_W)`, `waitTime`(min), `waitLength`(persons), `occurtime`(YYYYMMDDHHMM), `operatingTime` · 1-minute cadence | same | Checkpoint waits ≠ duty-free visitors ≠ sales |
| S1 | Seoul real-time city data | 서울 열린데이터광장 OA-21285/OA-21778 | `openapi.seoul.go.kr:8088/{KEY}/json/citydata_ppltn/1/5/{POI}` (CONFIRMED) · POI003 명동 관광특구 · POI007 홍대 관광특구 · POI068 성수카페거리 · success key `"SeoulRtd.citydata_ppltn"` + `RESULT["RESULT.CODE"]="INFO-000"` (error envelope uses undotted `RESULT.CODE`) · congestion labels 여유/보통/약간 붐빔/붐빔 · `FCST_PPLTN` = 12 hourly forecasts · ~5-min updates · assume ~1,000 calls/day-class quota | `SEOUL_OPEN_DATA_KEY` | Live population ≠ foreign tourists ≠ shoppers |
| S2 | Short-stay foreign population | 서울 250M격자 생활인구(단기외국인) — successor of dong-level OA-14993 family, discontinued per 2026-06-09 portal notice | Grid dataset exists (내국인 = OA-22784); 단기외국인 grid OA-ID and OpenAPI service name UNVERIFIED; Sheet/OpenAPI serve only single day at D-5; history via CSV (cp949, EPSG:5179 250m grid) | Seoul key (likely) | Foreign presence ≠ tourist ≠ shopper ≠ sales; do not join old dong series with new grid series silently |
| S3 | Estimated commercial sales | 서울시 상권분석서비스(추정매출-상권) OA-15572 | `openapi.seoul.go.kr:8088/{KEY}/json/VwsmTrdarSelngQq/{start}/{end}/{STDR_YYQU_CD}` (CONFIRMED; live verification 2026-08-27 showed only the quarter positional filter applies — trade-area segments are ignored, so the collector sweeps the quarter in 1000-row pages and filters client-side) · quarterly 20211–20261 · fields `THSMON_SELNG_AMT/CO` + weekday/time/gender/age splits · trade areas: 명동 3001492(관광특구)·3120028(명동거리)·3120027(명동역), 홍대 3120103(홍대입구역)·3120102(서교동)·3120104(연남동), 성수 3110131(성수동카페거리)·3120052(성수역) | same Seoul key | 추정매출 = modelled estimate, NOT live POS sales, NOT foreign spend |
| W1 | KMA short-term forecast | 기상청 · data.go.kr 15084084 | `apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` (CONFIRMED) · issued 02/05/08/11/14/17/20/23 KST (+~10min) · grids: 명동 (60,127) · 홍대/서교동 (59,126) · 성수 (61,126) · 인천공항/운서동 (51,125) · categories POP/PTY/PCP/REH/SKY/TMP/TMN/TMX/WSD… · `PCP`/`SNO` are strings ("강수없음", "1.0mm 미만") · SKY 1=맑음 3=구름많음 4=흐림 · resultCode "00"=OK, "03"=NO_DATA · 10,000 calls/day dev | `DATA_GO_KR_SERVICE_KEY` | Forecast ≠ observation; issue time ≠ target time |
| T1 | Tourism events (TourAPI) | 한국관광공사 B551011 · KorService2 (KorService1 shut off ~2025-08) | `apis.data.go.kr/B551011/KorService2/searchFestival2` (CONFIRMED) · `eventStartDate` required · `locationBasedList2` (mapX/mapY/radius≤20000, contentTypeId=15, `dist` in response) for area mapping · success resultCode "0000" · v4.4 deprecates `areaCode`/`sigunguCode` in favor of `lDongRegnCd=11`(서울)/`lDongSignguCd` · 1,000 calls/day dev | same data.go.kr key | Event existence ≠ attendance ≠ demand ≠ sales |

No paid API, paid data, paid fallback or runtime LLM is approved. A source without verified commercial and automated-use terms remains disabled.

## Authentication notes

- data.go.kr issues one 일반 인증키 per account; utilization applications are per-API. Do not tell the owner a second "Decoding key" exists when the account screen shows one key.
- Gateway error code 30 (`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`) can mean an unregistered/malformed key **or** an approved-but-not-yet-propagated utilization application. The smoke check reports boolean-only diagnostics (`present` / `looksPercentEncoded` / `hasWhitespace`) and tries at most one alternate query construction against A1 when the stored value already looks percent-encoded (double-encoding an encoded key reproduces code 30).
- Seoul keys ride in the URL path; smoke/collector code must never log Seoul request URLs.
- TourAPI success code is `"0000"`; KMA/airport success is `"00"` — never share one success check.

## Source lifecycle

Raw adapter → schema validation → canonical normalizer → D1 → internal API → UI. Canonical records store source, record origin, event time, publication/availability time, retrieval time, freshness, schema version, quality status and a source hash. The frontend never receives an official service key and never calls a government API directly.

## Failure behavior

`LIVE`, `STALE`, `MISSING`, `DEGRADED`, `ERROR`, `OFFICIAL_HISTORICAL`, and `DEMO` are distinct. A last-good record may remain visible only with its original timestamp and a STALE label. Missing terminal data is N/A; it is never copied from the all-airport value. Each source fails independently; one blocked provider must never break the public site.

## Deduplication rule (A1 vs A2)

A2 exists to let duty-free operators cross-check customer-entered flight info. After both return authenticated responses, run a field-level comparison; keep A2 only if it adds fields or freshness A1 lacks. Do not store two parallel copies of the same flight rows. Record the decision here.

## S2 series transition

The dong-level 단기체류외국인 생활인구 series (OA-14993 family) stopped being updated after the 2026-06-09 portal reorganization notice; the successor is the 250M-grid product. The bundled UI history (2025-01 – 2026-07 monthly dong aggregates) remains labelled `OFFICIAL_HISTORICAL` with its original scope note. New grid data must be stored as a separate series with its own spatial unit; never splice it into the legacy dong series.

### Successor dataset IDs (read from the official catalog 2026-08-28)

Resolved from `data.seoul.go.kr` dataset pages by `scripts/discover-s2.mjs`. The IDs and titles are CONFIRMED.

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

**Still UNVERIFIED: the `OA-23018` OpenAPI service name.** The portal never emits it in any server response reached so far — the dataset page and its OpenAPI tab both ship the name as a literal `API_SERVICE_NAME` placeholder filled client-side. Do not guess it; see the handoff note below.

### Portal transport map (2026-08-28)

Established by probe, useful for any future dataset:

| Endpoint | Method | Returns |
|---|---|---|
| `/dataList/datasetList.do` | GET/POST | client-rendered shell; search term never reaches the server |
| `/dataList/{OA-id}/S/1/datasetView.do` | GET | dataset page; related-dataset IDs and titles only |
| `/dataList/openApiView.do` | **POST** `infId,srvType,serviceKind` | the OpenAPI tab (path form `/dataList/{id}/S/1/openApiView.do` 404s) |
| `/together/mypage/getReqParam.do` | **POST** `infId` | JSON parameter spec — the one endpoint that reliably answers |
| `/dataList/getOpenApiSample.do` | POST/GET | 980-byte error page in every parameter shape tried |

### Authenticated probe status (2026-08-28)

- `SPOP_LOCAL_RESD_DONG` returned `INFO-000`, 630,988 rows, `STDR_DE_ID=20260731` — the **domestic** dong living-population service is live.
- Every guessed foreign variant (`SPOP_FORN_RESD_DONG`, `SPOP_TEMP_FORN_RESD_DONG`, `SPOP_LONG_FORN_RESD_DONG`, four `_GRID` forms) returned `ERROR-500 서버 오류입니다`.
- **`ERROR-500` carries no information about discontinuation.** A deliberately nonexistent control name (`KORETAIL_CONTROL_NO_SUCH_SERVICE`) returns the identical `ERROR-500`; the run reports `foreignCodeInterpretation=INDISTINGUISHABLE_FROM_UNKNOWN_SERVICE_NAME`. Those seven names are simply not known service names — none of it is evidence that a series ended.
- Consequence: the "dong-level foreign series stopped updating" claim rests on the 2026-06-09 portal notice **alone**. Do not cite the ERROR-500 responses as corroboration.

### Owner handoff for S2

One manual step unblocks this, and it is faster for a person than for any probe: open
`https://data.seoul.go.kr/dataList/OA-23018/S/1/datasetView.do`, read the **샘플 URL** on the OpenAPI tab, and copy the segment after `/json/`. That is the service name. With it, S2 becomes a normal adapter: parameters `YMD`, `TT`, `H_DNG_CD` are already confirmed, and the three target areas map to 행정동 codes.

The prepared airport schedule is 12 calls/day and at most 24 with its single retry, below the listed 500-call development quota. This is a quota calculation, not proof of a successful approved-key response.
