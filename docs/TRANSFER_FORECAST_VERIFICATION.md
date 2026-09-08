# Official transfer forecast verification — 2026-09-08

Starting main: 28325cf9f5ab329e48eb0a3bfff82eb43d854f8e.
Existing branch fix/seoul-glance-transfer-truth retains 3f2d8eb and b61abded.

## Proven decision: Case A, arrival-based transfer security forecast only

Official service: https://www.airport.kr/ap_ko/883/subview.do
The page states daily 17:00 updates; departure D+2, arrival/transfer D+1.
Its `excelFrm` has no method attribute, so browser default is GET:

`https://www.airport.kr/pni/ap_ko/statisticPredictCrowdedOfInoutExcel.do?selTm=T1&pday=20260909`

Parameters: `selTm=T1|T2`; `pday=YYYYMMDD` is the requested SERVICE date,
not download/publication date. Both requests returned HTTP 200 without incoming
cookies, session, login, API key, or Referer on 2026-09-08 14:20 UTC (23:20 KST).
The response sets cookies but retrieval does not require sending them.
MIME: `application/x-msdownload; charset=UTF-8`.
Content-Disposition: T1 `attachment; filename=E20260909.xls;`; T2 `attachment; filename=E20260909T2.xls;`.
Actual format: OLE compound document / BIFF8 `.xls`, not HTML or XLSX.
The filename, request scope and workbook title/
transfer headers are validated together. Old document creation/save metadata are
TEMPLATE metadata and MUST NOT be used as publication timestamps.

Sheets, both files: 출국승객예고, 입국승객예고, 환승객예고,
출국노선별승객예고, 입국노선별승객예고1, 입국노선별승객예고,
출국셔틀트레인승강장예상인원, 입국셔틀트레인승강장예상인원, basedata.

The dated title in 출국승객예고 is 2026년 09월 09일 ... 국제선 승객 예고
(T2 explicitly has T2). The 환승객예고 sheet has 45 rows, 10 columns.
Only section 2, `보안검색대별 환승여객(도착기준)`, is collected:
- row 9 (1-based): T1 터미널 / 탑승동, or T2 제2여객터미널; column J 계.
- row 11: 환승객(명), official total in J11.
- row 15: 시간대별 환승 보안검색대별 환승여객.
- rows 19–42: 24 hourly bands, 0~1시 through 23~24시.
- row 43: 계, agreeing with J11 and all hourly/component totals.
- T1 components B/D/F/H = terminal east/west and concourse east/west.
- T2 components B/F = security A/B.

Verified service-date values in original-file fixtures: T1 559; T2 10,485.
These are OFFICIAL FORECASTS, despite the template using 실적(명) elsewhere.
The page and worksheet titles establish forecast meaning. They are NOT realised
transfer counts and NOT departing transfer counts.
Section 1 `예약환승객(전체)` has airline-specific figures and a different total;
it is deliberately NOT ingested, nor treated as an airport-wide unique count.
No airport total is stored or manufactured. No historical ratios are used.

## Owner-requested arithmetic display (2026-09-09)

The owner requested addition with component figures beneath the headline. The UI
now labels the result explicitly as an arithmetic sum of two forecasts, NOT an
official or deduplicated departing-passenger total. The concise visible note says
arrival basis / overlap unverified / not total departures. The original long Excel
explanation was removed from the briefing. A5 is called departure-hall forecast,
not “general passengers”. Both components must exist for the exact selected date;
all-terminal arithmetic requires both T1 and T2. Missing, duplicate, invalid, or
partial inputs produce no sum. Only presentation changes: no collector, storage,
history, official forecast chart, or comparison is changed. Additional provider
calls, DB reads/writes, paid APIs, runtime LLM calls: zero.

## No combined departing total

Arrival-based transfer security and departure-hall use have different temporal
and population bases. The workbook mentions transfer effects on reservation vs
hall counts but does not prove all six non-overlap/scope conditions for adding
A5 to transfer security. Therefore no official combined departing total, even for the same service date.
The separately labelled arithmetic display above is not such a total.
T1/T2 remain individually visible in the all-terminal view.

A5 label: 금일 출국장 공식 예상 승객 / 선택일 출국장 공식 예상 승객.
Scope: 인천공항 출국장 이용 예상 기준 · 내·외국인 구분 없음.
Visible limitation: 현재 사용하는 공개 승객예고 API에는 환승객 별도 예고 수치가
포함되지 않아 환승객을 합산한 전체 출발 여객 수는 아닙니다.
Excel label: 환승 보안검색 이용 예상 · 도착 기준.

## Production operation and cost

One source-specific GitHub workflow, no overlapping Worker alarm. A successful normal Production deployment also checks once for missing data:
08:10/08:30/09:00/10:00 UTC = 17:10/17:30/18:00/19:00 KST.
GitHub alarms may start late; after17 the runner derives D+1 from KST. A deployment bootstrap before17 requests the current service date from the real official file published the previous day; it never estimates missing history.
This reuses the existing GitHub runner → pinned Production D1 REST architecture,
source_health model, and changed-row/storage-write counters. A separate workflow
is needed for the isolated Python BIFF reader; A5's hourly runner is unchanged.
No paid API, LLM, owner device, manual download or daily chat.
Recurring ChatGPT/Claude/Gemini/LLM calls and tokens: ZERO.

Every run reads the requested service date first, fetches only missing terminals,
and skips without provider requests or writes after success. At most 2 files on a
healthy primary; recovery costs zero provider requests when healthy. Network/429/
5xx retries bounded to 3 attempts; permanent HTTP/schema failures are recorded and
blocked for that service date until code/operator review. No silent cell fallback.
D1 stores separate date/terminal rows in airport_transfer_forecast; no pruning,
backfill, estimates, fabricated terminal splits, or unknown→zero conversion.
published_at stays NULL because exact file publication time is not supplied.
retrieved_at and SHA256 retain provenance; values are changed-only, with prior
service dates preserved. Summary adds one indexed, two-row read in the same batch.

Direct unauthenticated retrieval was verified for both real files; this is not a
long-term availability guarantee. Network/schema failures remain visible through
source_health and failed Actions runs, while last-good rows stay available.
Fixtures preserve exact original bytes encoded as gzip + base64, with no authored values.
