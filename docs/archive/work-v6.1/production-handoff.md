# RetailPulse Seoul — Production Handoff

> V6.1 final lock — 2026-08-24: umbrella brand is **RetailPulse Korea (RPK)**; current product and data coverage remain **Seoul only**. Product category is **Foreign Visitor Retail Intelligence**, not a congestion dashboard, airport super-app or sales predictor.

## V6.1 final product lock

Core gap: `FOREIGN VISITOR × RETAIL × TOMORROW × WHY × ACTION × PROSPECTIVE VALIDATION`.

- `AREA PULSE` is a general activity signal.
- `FOREIGN SHOPPING SIGNAL` is a versioned public-data proxy and is not foreign sales.
- Airport is an input context and focused utility; Business is the deepest product surface.
- Myeongdong, Hongdae, Seongsu and six industries remain frozen for the initial 90 production days.
- Forecast Lab/Track Record stay `COLLECTING` until immutable forward predictions match outcomes.
- Source contracts: `/forecast-target-registry.md`, `/forecast-contract.md`, `/outcome-contract.md`, `/no-leakage-policy.md`.
- Cost contract: `/zero-cost-policy.md`; no paid API/data/runtime LLM/automatic overage.

## Production implementation order

P0: verified-free keys/approvals → collectors → normalizer → storage → historical backfill → live data → immutable prediction archive → outcome archive.

P1: same-weekday/four-week/seasonal baselines → simple Forecast V1 → FAST verification → scoreboard.

P2: DEEP verification → feature evaluation → challenger shadow → reviewed promotion/rollback.

P3: server SEO → monitoring → privacy-respecting analytics → performance optimisation.

## Gate-area flow boundary

Use official flight detail for terminal/gate/check-in/status and official checkpoint congestion only within the published terminal/checkpoint scope. A derived gate-area wave may count scheduled departures and statuses by time window. It is not a passenger count and cannot be converted into duty-free store footfall, transactions or sales. No public store-level congestion source was verified. T2 checkpoint data must remain N/A when not officially supplied.

> V5 Work Site 기준일: 2026-08-23 KST
> 현재·미래 Pulse, Today/Tomorrow 공항값, 운항편, 예측정확도는 DEMO/SAMPLE DATA다. 공항 2025.08–2026.07 월별 실적과 서울 단기체류 외국인 2025.01–2026.07 집계는 출처·기간을 표시한 OFFICIAL HISTORICAL이다. Live 연동 완료를 주장하지 않는다.

## 1. 제품 경계

- 초기 서비스 지역은 명동·홍대·성수 세 곳만 유지한다.
- 핵심 순서는 Pulse → 지역 → 시간 → Why → Action → Image다.
- 공항은 주요 메뉴이자 외국인 쇼핑수요의 선행신호지만 제품의 주인공은 항상 지역 Pulse다.
- 내국인 카드소비와 외국인 소비, 방문자와 관광객, 예상과 실제, 서울과 개별 지역, Demo와 Live를 절대 혼동하지 않는다.

## 1-A. V5.6 Runtime/API Truth와 상세 기간 UX

### 현재 공개 Work Site

- 방문 시 직접 호출하는 외부 공공데이터 Runtime API: **0개**.
- 공식 Historical로 내장된 Source: **2개**.
  1. 인천공항 공식 월별·연간 실적. Frontend 월별 상세 2025.08–2026.07, 선택 연도 장기 참고 2010·2019–2025.
  2. 서울 단기체류 외국인 생활인구 월별 집계. Frontend 2025.01–2026.07.
- 지역 Today/Tomorrow·7일, 공항 Today/Tomorrow, Flight/Gate Wave, Business 신호·Action, Forecast Performance는 Demo다.
- 외부 Font asset 요청과 Cloudflare 내부 `ASSETS`/`IMAGES` 요청을 데이터 API 연결로 세지 않는다.

### Work에서 추가한 상세 기간 선택

- Airport History와 Business Historical Signals에 시작월·종료월 `type="month"` 선택기를 제공한다.
- Airport의 선택 기간은 월별 Chart/Table뿐 아니라 합계, 실제 달력일 기준 일평균, 처음 달→마지막 달 변화, Peak month, T1/T2 합계·구성비, 직전 동일 개월수 비교에 모두 적용한다.
- Business의 선택 기간은 월평균 생활인구, 처음 달→마지막 달 변화, Peak month, Chart와 결정론적 Insight에 적용한다.
- 시작월이 종료월보다 뒤면 적용을 막는다. 선택 가능 범위를 UI에 표시한다.
- 7D/30D는 월별 값을 일별로 변형하지 않고 `HISTORICAL GAP`을 유지한다.
- 현재 선택 가능 범위 밖의 월은 Production Backfill 이후에만 제공한다. UI에 존재하지 않는 과거 월을 있는 것처럼 만들지 않는다.

### Production 데이터 계약

```ts
type HistoricalRangeQuery = {
  source: "airport" | "foreign_population";
  startMonth: `${number}-${number}`; // YYYY-MM
  endMonth: `${number}-${number}`;   // inclusive
  terminal?: "ALL" | "T1" | "T2";
  direction?: "DEPARTURE" | "ARRIVAL" | "TOTAL";
  area?: "myeongdong" | "hongdae" | "seongsu";
};

type HistoricalRangeResponse<T> = {
  coverage: { earliest: string; latest: string; missingMonths: string[] };
  publishedStatus: "PUBLISHED_FINAL" | "PROVISIONAL";
  rows: T[];
  sourceUpdatedAt: string;
  retrievedAt: string;
};
```

- Query는 `startMonth <= endMonth`, 최대 조회 개월수, 허용 enum을 Server에서 다시 검증한다.
- Missing month는 0으로 채우지 않는다. `missingMonths`로 반환해 Chart가 선을 임의로 연결하지 않게 한다.
- 현재월 Partial은 완료월과 직접 비교하지 않고 same-elapsed-days 또는 daily average만 사용한다.

## 2. 권장 페이지 구조

- `/`: Work 기본 Home
- `/{locale}`: 언어별 Home (`ko`, `en`, `zh`, `ja`)
- `/{locale}/{myeongdong|hongdae|seongsu}`: Today/Tomorrow 지역 순위·대표 지역 상세·Why·공유
- `/{locale}/forecast`: 7일 예측, 지역 비교, 신뢰도
- `/{locale}/airport`: 전체/T1/T2, Today/Tomorrow, 7D/30D Gap, 6M/12M/ALL 공식 History, 항공사/노선 Wave, 게이트·면세구역 Flow, Flight Search
- `/{locale}/business`: 6업종 Opening Brief, 외국인 생활인구 Historical Signals, 예측 성과
- `/{locale}/more`: Data Health, Source Catalog, Methodology/FAQ, My RetailPulse, 언어, Pro Preview
- 실제 정보가 없는 자동 SEO 페이지를 대량 생성하지 않는다.

## 3. 컴포넌트

- AppShell / TopBar / BottomNavigation
- DaySwitch / AreaRanking / AreaDetail
- PulseNumber / BestTime / SignalRows / ActionTips
- SevenDayForecast / AreaComparison / ConfidenceStrip
- TerminalSelector / AirportPulse / PassengerVolume / AirportHistory / MonthlyPassengerTrend / AirlineIntelligence / GateRetailFlow / FlightSearch / FlightList
- BusinessAreaSwitch / IndustrySelector / BusinessPulse / ActionPlan / DecisionSignals / BusinessHistory
- HistoryScoreboard / BenchmarkTable / HarnessStatus
- DataHealth / SourceDirectory / SourceAccessFilter / LanguageControl / ErrorState / ProPreview
- EditorialImagePrimary / EditorialImageSecondary
- TodayBrief / WhatChanged / GlobalSearch / WhyThisNumber / SharePulse
- MyRetailPulse / MyAirport / FlightWave / TerminalHistoricalCompare / MethodologyFAQ

## 4. 이미지 Assets

- Primary: `/assets/seoul-hangang.jpeg`
  - alt: 석양 아래 한강과 남산서울타워가 보이는 서울 전경
  - 남산서울타워·다리·한강을 살리는 별도 모바일 focal point 유지
  - Production에서 AVIF/WebP, responsive srcset, width/height 또는 aspect-ratio 고정, preload 적용
- Secondary: `/assets/seoul-hanok.jpeg`
  - alt: 한옥 지붕 너머로 남산서울타워가 보이는 서울 풍경
  - Production에서 lazy-load
- 두 이미지 모두 사용자가 제공했다. 상업 공개 전 사용자가 상업적 사용 권리를 보유했는지 확인한다.
- 과도한 HDR·Glow·Orange/Blue filter를 적용하지 않는다.

## 5. 데이터 Schema

```ts
type PulseRecord = {
  observedAtKst: string;
  targetDateKst: string;
  area: "myeongdong" | "hongdae" | "seongsu";
  horizon: "current" | "today" | "tomorrow" | "7d";
  areaPulse: number | null;
  foreignShoppingPulse: number | null;
  bestTime: { start: string; end: string } | null;
  airportSignal: number | null;
  foreignPopulationSignal: number | null;
  tourismSignal: number | null;
  weatherSignal: string | null;
  eventSignal: number | null;
  confidence: number;
  modelVersion: string;
  dataStatus: "live" | "delayed" | "partial" | "unavailable";
};

type PredictionRecord = {
  predictionId: string;
  createdAtKst: string;
  targetDateKst: string;
  area: string;
  prediction: number;
  modelVersion: string;
  featureSnapshotHash: string;
  actual: number | null;
  actualFinalizedAtKst: string | null;
};

type AirportPassengerRecord = {
  observedAtKst: string;
  targetDateKst: string;
  direction: "departure" | "arrival";
  terminal: "T1" | "T2" | "all";
  value: number | null;
  measure: "actual_so_far" | "forecast_full_day" | "actual_daily" | "monthly_total" | "monthly_daily_average";
  source: string;
  status: "live" | "delayed" | "partial" | "unavailable";
};

type DataPoint = {
  sourceId: string;
  metric: string;
  area: "myeongdong" | "hongdae" | "seongsu" | null;
  terminal: "ALL" | "T1" | "T2" | null;
  direction: "DEPARTURE" | "ARRIVAL" | "TOTAL" | null;
  date: string | null;
  timestamp: string | null;
  periodType: "hour" | "day" | "week" | "month" | "year";
  value: number | null;
  unit: "people" | "flights" | "won" | "percent" | "index" | "events";
  recordOrigin: "OFFICIAL_HISTORICAL" | "LIVE_OBSERVED" | "FORECAST_CAPTURED" | "BACKFILLED" | "DEMO";
  isForecast: boolean;
  isPartial: boolean;
  publishedStatus: "CURRENT_PROVISIONAL" | "PUBLISHED_FINAL" | "NOT_OPERATING" | "NOT_AVAILABLE";
  sourceUpdatedAt: string | null;
  retrievedAt: string;
  modelVersion: string | null;
};

type AirportForecastRecord = {
  forecastIssuedAt: string;
  targetDate: string;
  terminal: "ALL" | "T1" | "T2";
  direction: "DEPARTURE" | "ARRIVAL";
  hourBucket: string | null;
  predictedPassengers: number;
  source: string;
  sourceUpdatedAt: string;
};

type AirportFlight = {
  flightId: string;
  airlineIata: string;
  airlineName: string;
  scheduledAt: string;
  estimatedAt: string | null;
  airportCode: string;
  airportName: string;
  direction: "DEPARTURE" | "ARRIVAL";
  terminal: "T1" | "T2" | null;
  gate: string | null;
  checkinCounter: string | null;
  status: string | null;
  sourceUpdatedAt: string;
};

type DepartureCheckpointObservation = {
  observedAtKst: string;
  terminal: "T1";
  checkpoint: "1" | "2" | "3" | "4" | "5" | "6";
  side: "EAST" | "WEST" | null;
  waitingPeople: number;
  recordOrigin: "LIVE_OBSERVED";
  sourceUpdatedAt: string;
};

type GateRetailFlowSignal = {
  targetWindow: { startKst: string; endKst: string };
  terminal: "T1" | "T2";
  gateClusterId: string;
  activeDepartureFlights: number;
  delayedDepartureFlights: number;
  cancelledFlightsExcluded: number;
  checkpointWaitingPeople: number | null;
  openRetailFacilities: number | null;
  level: "LOW" | "MODERATE" | "HIGH" | "NOT_AVAILABLE";
  label: "ZONE_FLOW_SIGNAL";
  evidence: string[];
};

type BusinessBriefing = {
  area: "myeongdong" | "hongdae" | "seongsu";
  industry: "beauty" | "fashion" | "food" | "convenience" | "popup" | "tourism";
  targetDateKst: string;
  demandScore: number;
  deltaVsFourWeekAverage: number | null;
  priorityTime: { start: string; end: string };
  confidence: number;
  actions: Array<{ type: "staff" | "stock" | "offer" | "flow" | "content"; textKey: string }>;
  supportingSignals: Array<{ sourceId: string; value: number | string | null; asOfKst: string; dataStatus: string }>;
};
```

## 6. API 후보, 무료 범위와 채택 원칙

우선 전수검토:

1. 서울 실시간 도시데이터
2. 인천공항 승객예고·입국장 현황·운항 상세·T1 출국장 혼잡
3. 관광공사 관광지 집중률 예측·지역별 관광수요 강도·방문자수·관광 다양성
4. 서울 단기체류 외국인 생활인구
5. 기상청 단기예보
6. TourAPI 행사 및 한국어·영어·중국어 간체/번체·일본어
7. 서울 지하철 승하차·상권 추정매출·환율·공휴일·검색트렌드·쇼핑인사이트

각 API는 무료 여부, 상업 이용, 재배포, 호출 한도, 필드 정의, 갱신주기, 장애 시 fallback을 공식 문서로 검증한다. 실제 예측 개선효과가 없는 데이터는 많아도 넣지 않는다. 공식 API에 없는 게이트·체크인·지연 필드를 생성하지 않는다. T1 출국장 대기값을 T2로 복제하지 않고, 면세시설 위치를 매장별 방문객·매출로 바꾸지 않는다.

### 접근조건 매트릭스 (2026-08-23 검토 기준)

| Source | 용도 | Production 접근 | 주의 |
|---|---|---|---|
| 인천공항 공식 여객예고 | 출국 D+2, 입국·환승 D+1 | 공식 Web·Excel 공개, 자동화 API 계약은 `AUTOMATION_REVIEW` | Key가 확인됐다고 단정하거나 HTML을 무단 크롤링하지 않음 |
| 인천공항 운항 상세 | D-3~D+6 편명·터미널·게이트·체크인·상태 | data.go.kr 프로젝트키, 별도 활용신청, 무료 개발 500회/일 | 운영 트래픽은 활용사례·URL 기재 후 심의 |
| 인천공항 출국장 혼잡도 | T1 출국장 1~6번 동서측 대기인원 | 같은 data.go.kr 프로젝트키, 별도 활용신청, 무료 개발 1,000회/일 | 1분 현재값, T2는 공식 미제공이라 N/A |
| 인천공항 입국장 현황 | H-2~H+2 T1/T2 도착편·게이트·대기인원 | 같은 data.go.kr 프로젝트키, 별도 활용신청, 무료 개발 500회/일 | 장기 History가 아니라 짧은 운영창 |
| 인천공항 면세점 안내 | 시설·운영사·영업시간·게이트 인접 위치 | 공개 Directory, 자동화 조건 검토 | 위치정보는 실제 방문객·매출이 아님 |
| 서울 실시간 도시데이터 | 도시 활동·혼잡·교통 | 서울 열린데이터 API | 서울 전체와 명동·홍대·성수 공간 범위를 혼동하지 않음 |
| 서울 단기체류 외국인 생활인구 | 외국인 체류 신호 | 공공 파일/API | D-4 등 지연주기와 관광객 여부를 명시 |
| 서울×KT 수도권 생활이동 | 쇼핑·관광 목적 이동 | 서울 열린데이터 파일 | KT 상용상품과 별개인 공개 데이터셋으로 취급 |
| 한국관광 데이터랩 / TourAPI | 관광수요·방문·행사·다국어 POI | 공식 다운로드 또는 공공 API | 데이터랩 웹화면 무단 스크래핑 금지 |
| 기상청 단기예보 | 강수·기온·풍속 | 같은 data.go.kr 프로젝트키로 별도 활용신청, 무료 개발 10,000회/일 | 제1유형 출처표시, 발표시점과 대상시점을 함께 저장 |
| 네이버 DataLab / Shopping Insight | 검색·쇼핑 클릭 추세 | 앱 등록·Client ID/Secret, 일 1,000회 | 상대지수이며 검색량·판매액이 아님 |
| 한국은행 ECOS | 환율·거시 보조신호 | 오픈 API | 보조 Feature로만 사용하고 인과를 단정하지 않음 |
| 천문연 특일 | 공휴일·특일 | 공공 API 신청키 | 날짜 Dimension으로 캐시 |
| SKT Geovision Puzzle/Open API | 유동·생활·이동 교차검증 | 무료 플랜 가능, 재배포 사전허가 필요 | 무료 호출과 상업적 재배포 권리는 다름 |
| KT 잘나가게 / PLIP / BigSight | 상권·생활인구·관광 이동 참고 | 무료 조회/샘플 또는 상용 조건 확인 | 공개 Runtime API라고 전제하지 않음 |
| 서울 지하철·상권 추정매출 | 이동·기준선 | 공공 데이터 | 내국인 카드소비를 외국인 소비로 표시 금지 |

모든 Secret은 GitHub/Cloudflare Secret Store에만 둔다. 클라이언트 빌드에는 공개 가능한 파생 JSON만 전달한다.

공식 검토 출발점:

- 인천공항 입국장 현황: <https://www.data.go.kr/data/15095061/openapi.do>
- 인천공항 출국장 혼잡도: <https://www.data.go.kr/data/15148225/openapi.do>
- 인천공항 항공편 운항 상세: <https://www.data.go.kr/data/15140153/openapi.do>
- 인천공항 면세점 안내: <https://www.airport.kr/ap_ko/1003/subview.do>
- 인천공항 Open Data Portal: <https://odp.airport.kr/apiPortal/main>
- 한국관광 데이터랩: <https://datalab.visitkorea.or.kr/>
- 네이버 Shopping Insight API: <https://developers.naver.com/docs/serviceapi/datalab/shopping/shopping.md>
- 서울 열린데이터광장: <https://data.seoul.go.kr/>
- 서울×KT 수도권 생활이동: <https://data.seoul.go.kr/dataList/OA-22300/F/1/datasetView.do>
- SKT Geovision Puzzle FAQ: <https://puzzle.geovision.co.kr/faq>
- KT PLIP: <https://enterprise.kt.com/pd/P_PD_AI_BD_003.do>
- 한국은행 ECOS Open API: <https://ecos.bok.or.kr/api/>
- 천문연 특일 정보: <https://www.data.go.kr/data/15012690/openapi.do>

## 7. Mock → Live 교체 위치

- `scores`: 지역·날짜별 Pulse API 응답
- `forecast`: 7일 forecast series
- `flights`: 편명·항공사·노선·터미널·게이트·체크인·운항상태 공식 정규화 결과
- Gate & Retail Demo: `DepartureCheckpointObservation`, `AirportFlight`, 공식 시설 Directory를 결합한 `GateRetailFlowSignal`. 매장별 footfall/매출로 명명 금지
- Airport Today/Tomorrow Demo: `AirportForecastRecord`와 Live observed 집계 API. T1/T2 미제공 필드는 전체값 복제 금지
- `airportMonthly`: 공식 2010.01–최신 완료월 Backfill Aggregate
- `foreignMonthly`: OA-14993/250m Grid ETL Aggregate
- `industryProfiles`: 업종별 콘텐츠 규칙 저장소. 향후 추천 정책 버전과 번역 key로 분리
- Business의 8개 판단 신호: `BusinessBriefing.supportingSignals`
- `sourceCatalog`: 공식 Source Registry와 권한검토 결과
- `healthSources`: Collector heartbeat와 freshness
- History 21/6/3 및 MAE: 확정 Outcome 기반 Scoreboard
- UI에는 `recordOrigin`, `publishedStatus`, `dataStatus`에 따라 LIVE / OFFICIAL HISTORICAL / BACKFILL / DELAYED / PARTIAL / DEMO를 명확히 표시한다.

## 8. Forecast Engine

- V1: Python + skforecast. 단순 평균과 지난주 같은 요일을 반드시 Baseline으로 둔다.
- 특징 후보: 공항 입국 흐름, 단기체류 외국인 생활인구, 관광수요, 날씨, 행사, 공휴일, 환율, 역별 승하차.
- Target과 Feature의 시간 기준을 KST로 고정한다.
- 발표·수집 시점이 Target 이후인 미래정보를 Feature에 넣지 않는다.
- Calibration 후 0–100 Pulse와 confidence를 별도로 산출한다.
- 단순 평균보다 계속 못하면 우수하다고 표시하지 않는다.

## 9. Evolution Harness Lite

Recorder → Outcome → Scoreboard → Failure Miner → Candidate Lab → Backtest → Shadow → Promotion → Rollback

- Prediction은 생성 후 수정 금지. 정정은 새 버전과 사유를 추가한다.
- Actual은 미래 Outcome이 확정된 뒤 연결한다.
- 초기에는 Recorder / Outcome / Scoreboard / API Health만 활성화한다.
- Candidate는 충분한 고유 날짜가 쌓인 뒤 만든다.
- Backtest만으로 자동 승격하지 않는다. 미래 Shadow 검증과 Benchmark 우위를 모두 요구한다.
- Champion/Challenger를 분리하고 성능 악화 시 즉시 Rollback한다.
- 자동 변경 허용: feature weight, threshold, model selection, hyperparameter, calibration, 허용 feature 조합.
- 자동 변경 금지: Python 임의 재작성, secret/security/API 권한/결제/constitution 변경, 사용자 데이터 삭제.
- 데이터가 적을 때 학습완료·자가진화완료라고 쓰지 않는다.

## 10. Production Architecture

무료 공공 API → GitHub Actions Python Collector → Normalizer → Forecast Engine → Evolution Harness → Cloudflare KV → Worker Light API → Pages/PWA

- Pages에는 Site code만 둔다.
- 현재·예측 데이터는 KV, 가벼운 JSON API는 Worker가 제공한다.
- 데이터 변경마다 Pages Build를 하지 않는다.
- Worker에서 ML을 실행하지 않는다.
- 대용량 원본 API 응답을 Git에 누적하지 않는다.
- 작은 Feature/History만 보존한다.
- GitHub Actions는 소스별 갱신주기에 맞춰 합쳐 실행하고 과도한 매시간 Job을 피한다.

## 11. 다국어

- 한국어·English·简体中文·日本語를 동일 기능으로 제공한다.
- 문자열 키와 데이터 값을 분리하고 locale route를 사용한다.
- 중문은 고정 높이 텍스트 상자를 피하고 320px 폭에서 줄바꿈을 확인한다.
- 번역 누락 시 영어 fallback과 LANGUAGE MISSING 상태를 표시한다.
- 한국어 데이터가 영문·중문 Live 정보처럼 잘못 복제되지 않게 출처 필드를 유지한다.

## 12. 오류 처리

- Loading: Skeleton과 최신 정상 데이터 시각 분리
- API Delayed: freshness와 confidence 하락 표시
- Partial Data: 사용 가능한 신호와 누락 신호 공개
- No Forecast / No History: 데이터 부족을 학습 실패와 혼동하지 않음
- Network Error: retry와 마지막 업데이트 시각 제공
- No Flights: 검색조건 수정 안내
- Cancelled Flight: Red status와 원문 공식상태 유지
- Language Missing: 영어 fallback 표시

## 13. Security / Cost

- Runtime LLM API 비용 0원. OpenAI·Anthropic·Gemini Runtime 호출을 넣지 않는다.
- API secret, token, password, private key를 클라이언트나 Git에 넣지 않는다.
- GitHub Secrets와 Cloudflare Secret Store를 사용한다.
- 외부 입력 schema validation, 요청 timeout, rate limit, stale cache fallback을 적용한다.
- 유료 지도·유료 데이터·결제 SDK는 V1 필수 의존성이 아니다.
- Pro는 현재 Preview이며 실제 결제를 연결하지 않는다.

## 14. 테스트

- Unit: Normalizer, time-zone, score calibration, missing data, confidence
- Data contract: 공식 API 필드가 바뀌면 실패
- Leakage: prediction 시점 이후 데이터 접근 금지
- Backtest: rolling-origin only
- UI: 지역 선택, Today/Tomorrow, 7 Days, Airport, 일·월 승객규모, Search, 업종 변경, Business 행동제안, 예측성과, Source filter, 언어, Data Health, Pro
- Error state: loading/delayed/partial/no forecast/no history/network/no flights/cancelled/language missing
- Mobile: 320/375/390/430px, safe area, 가로스크롤, 이미지 crop, 중문 줄바꿈
- Accessibility: keyboard, focus, contrast, alt, reduced motion
- Performance: responsive image, primary preload, secondary lazy-load, CLS, Core Web Vitals

## 15. 권장 오픈소스

- V1: skforecast, Optuna, vite-plugin-pwa, Apache ECharts
- 향후 검토: River, Evidently, Darts
- 라이선스와 상업 조건이 불명확한 관광 GitHub 코드는 복사하지 않는다.

## 16. V4 T1/T2 규칙

- Airport 최상단 TerminalSelector의 `ALL/T1/T2`는 History, Airline, Flight에 공통 적용한다.
- 공식 Source가 Terminal을 제공하지 않으면 `NOT_AVAILABLE`을 반환한다. 전체값·항공사 관행·임의 비율로 T1/T2를 만들지 않는다.
- 전체는 T1+T2가 같은 기간·방향·정의로 정확히 합산 가능한 경우만 계산한다.
- T2 2018년 이전은 `NOT_OPERATING`; `0`이나 `null`과 의미를 분리한다.
- 항공사 통상 터미널을 고정하지 않고 항공편별 공식 terminal field를 우선한다.
- 하나의 Terminal Source 실패 시 다른 Terminal과 전체 Source가 정상이라면 부분응답을 유지하고 Confidence를 낮춘다.

## 17. 숫자 Formatter

- `formatCount(locale, value, unit)`를 언어별로 분리한다.
- 승객·항공편·매출 Count에 `K/M/B`를 사용하지 않는다.
- 한국어: Headline은 `5만 8,430명`처럼 읽기 쉬운 표현을 허용하되 Detail/Tooltip은 `58,430명`을 제공한다.
- English: `58,430 passengers`, `4,294 flights`.
- 简体中文: 자연스러운 `万/亿`은 Headline에서만 허용하고 Detail은 `58,430人`을 제공한다.
- 기간 Selector의 `3M/6M/12M`은 Month를 뜻하는 제어 Label이므로 Count 약어와 분리한다.
- 소스 전체 QA Regex: 소수 Count 축약 `\b\d+\.\d+[KMB]\b` 0건.

## 18. Forecast Archive와 Harness 분리

Production 연결 시 매일 D+1/D+2 Source Forecast를 수정불가 Snapshot으로 저장한다.

```text
forecastIssuedAt
targetDate
terminal
direction
hourBucket
predictedPassengers
source
sourceUpdatedAt
retrievedAt
```

Actual 확정 후 `actualPassenger`, `outcomeResolvedAt`을 연결한다. `OFFICIAL_HISTORICAL` Backfill을 과거 Forecast로 변환하지 않는다. Candidate Promotion에는 `FORECAST_CAPTURED → OUTCOME` Prospective 기간만 최종 근거로 사용한다. Offline Backtest는 연구용이다.

## 19. Deterministic Historical Intelligence

- Runtime LLM API 사용 금지.
- 동일 Frequency의 완료 Period만 `DoD/WoW/MoM/YoY` 비교한다.
- 미완료 월은 같은 경과일, 일평균 또는 명시적 Projection으로 비교한다.
- Template 예: `current > avg4w * 1.1`이면 "최근 4주 평균보다 10% 이상 높습니다."
- Insight에는 `period`, `source`, `recordOrigin`, `isPartial`을 함께 전달한다.
- 공항 목적지·노선 Region은 승객 국적 설명에 사용하지 않는다.

## 20. Cloudflare 데이터 배치

```text
Public APIs / Official files
  → GitHub Actions Python collectors
  → schema validation + normalizer
  → aggregate + forecast engine
  → outcome resolver + Evolution Harness
  → Cloudflare KV/D1/R2 (measured choice)
  → Worker light JSON API
  → Pages/PWA
```

- Pages build는 Site code 변경 때만 수행한다.
- History는 `airport/current`, `airport/daily/YYYY-MM`, `airport/monthly`, `airport/airlines/YYYY-MM`, `area/{id}/summary`처럼 분할한다.
- 대용량 ZIP/CSV/Raw JSON은 Git에 Commit하지 않는다.
- Worker에서 ML을 실행하지 않는다.
- Source 실패는 stale-last-good 또는 Feature 제외로 격리하고 전체 Site를 중단하지 않는다.

## 21. Production 구현 Script와 순서

1. `backfill_airport_history.py`: 2010.01–최신 완료월, T1/T2, checksum, published status
2. `backfill_airport_airlines.py`: 항공사·노선·운항·여객·지연·결항, 정의변경 Flag
3. `backfill_foreign_population.py`: 2017.01–2026.07 행정동 파일, 세 지역 Aggregate
4. `collect_foreign_population_grid.py`: 2026.08 이후 250m 경계 Mapping
5. `collect_airport_forecast.py`: D+1/D+2 Terminal·hour Snapshot
6. `collect_airport_flights.py`: 운항 상세, Terminal·gate·check-in·status
7. `collect_airport_departure_checkpoints.py`: T1 출국장 1~6번 1분값을 검증하고 5분 Snapshot으로 축약
8. `snapshot_airport_retail_directory.py`: 공식 시설 위치·영업시간 변경 감지, 자동화 조건 불명확 시 수동 검증 Snapshot
9. `compute_gate_retail_flow.py`: 취소편 제외·변경시간 반영·T2 checkpoint N/A를 지키는 구역 Flow 산출
10. `collect_weather_forecast.py`와 `backfill_weather_observed.py`: 예보와 관측 분리
11. `collect_tourism.py`, `collect_subway.py`, `collect_exchange.py`, `collect_holidays.py`
12. `normalize_retailpulse.py`, `compute_pulse.py`, `update_outcomes.py`, `run_evolution_lab.py`

모든 Secret은 GitHub Secrets 또는 Cloudflare Secrets에만 저장한다. Frontend bundle에는 Secret을 넣지 않는다.

## 22. 관련 문서

- [Data Source Matrix](/data-source-matrix.md)
- [Historical Backfill Plan](/historical-backfill-plan.md)
- [QA Report](/qa-report.md)
- [Live Readiness](/live-readiness.md)
- [Gate & Retail Data Audit](/gate-retail-data-audit.md)

## 23. Airline Intelligence 규칙

- 검색 Index는 IATA code, 한국어 항공사명, 영문 항공사명, 편명, 도시, 공항코드를 포함한다.
- 항공사 목록은 공식 운항정보에서 동적으로 만든다. KE/OZ/LJ/7C/TW 등의 예시는 고정 전체목록이 아니다.
- Terminal은 항공사 관행이 아니라 항공편별 공식 field를 우선한다.
- `NEXT 1H/3H/6H/TODAY`는 항공편 수를 집계하며 승객 수로 변환하지 않는다.
- 노선 Region은 목적지 분류일 뿐 승객 국적이 아니다.
- 항공사별 실시간 승객 수는 공식 Source가 제공하는 경우에만 표시한다.
- Favorite는 로그인 없이 Local Preference로 저장할 수 있으며 계정·개인정보를 추가하지 않는다.
- 지연 정의 변경일(2023-01-01)을 Historical aggregate metadata에 기록한다.

### Airline QA

- `KE`, `대한항공`, `Korean Air`가 동일 항공사 결과를 찾는지 확인
- T1/T2 + 출발/도착 + 항공사 + 노선 Filter 조합 확인
- 신규·외국 항공사는 공식 응답에서 동적으로 노출
- 편수·좌석·승객 수를 별도 Metric으로 유지
- Cancelled/Delayed 상태는 최신 공식 원문 상태를 Normalization한 결과만 사용

## 24. 이번 Work에서 수정한 Data Boundary

- 전체공항 Demo Today/Tomorrow 숫자와 혼잡시간을 T1/T2에 복제하지 않는다.
- T1/T2 Live API 미연동 상태는 `NOT_AVAILABLE`로 표시한다.
- T1/T2 공식 완료월 실적은 `OFFICIAL_HISTORICAL / PUBLISHED_FINAL`로 표시한다.
- 공항 7D/30D 실제 일별 Backfill 전에는 `HISTORICAL GAP` 상태를 유지한다.
- 화면의 공식월 실적과 Demo 운항편은 같은 Badge·Source 문구를 사용하지 않는다.

## 25. V5 i18n 계약

- Locale: `ko-KR`, `en`, `zh-CN`, `ja-JP`.
- 번역 key는 UI 문자열, deterministic insight template, 업종 brief, 오류상태, SEO metadata를 모두 포함한다.
- Font stack: `Pretendard Variable → Pretendard → Noto Sans JP → Noto Sans SC → system-ui`이며 일본어는 Noto Sans JP, 중국어는 Noto Sans SC를 우선한다.
- Production에서는 Pretendard Variable과 Noto 400/500/600만 self-host하고 `font-display: swap`, WOFF2 subset, preload 범위를 실제 사용량으로 결정한다.
- URL locale이 source of truth다. 브라우저 언어로 `/ja/*`를 `/ko/*`로 강제 redirect하지 않는다.
- 언어 변경 시 현재 View와 Area/Terminal/Industry 상태를 유지한다.
- 사람 수 formatter: KO `58,430명`, EN `58,430 passengers`, ZH `58,430人` 또는 Headline `5.8万`, JA `58,430人`. Count `K/M/B` 금지.

## 26. V5 Product Contract

### Opening Brief

```ts
type OpeningBrief = {
  targetDateKst: string;
  area: "myeongdong" | "hongdae" | "seongsu";
  industry?: "beauty" | "fashion" | "food" | "convenience" | "popup" | "tourism";
  score: number | null;
  bestTime: string | null;
  lines: Array<{ templateKey: string; evidence: string[] }>;
  recordOrigin: "LIVE_OBSERVED" | "FORECAST_CAPTURED" | "DEMO";
  confidence: number | null;
};
```

Runtime LLM 없이 허용된 Template와 검증된 신호만 사용한다.

### What Changed

- 같은 기준시간·같은 경과기간만 비교한다.
- `metric`, `previousValue`, `currentValue`, `unit`, `basis`, `recordOrigin`을 저장한다.
- Demo에서는 반드시 `DEMO COMPARISON`을 노출한다.

### My RetailPulse / My Airport

- LocalStorage key: `retailpulse-preferences`.
- 저장 허용: `lang`, `area`, `terminal`, `industry`, `airlines`.
- 계정, 이름, 위치, 검색기록, 항공권·여권 등 민감정보는 저장하지 않는다.
- Storage 접근 실패 시 기본 상태로 계속 동작해야 한다.

### Flight Wave

- 시간 Window: `NEXT_1H`, `NEXT_3H`, `NEXT_6H`, `TODAY`.
- 항공사·노선 Region별 `flight_count`만 집계하며 여객 수로 변환하지 않는다.
- Region은 목적지 분류이지 승객 국적이 아니다.
- Flight filter 조합: terminal + direction + airline + route + time window + status + query.

### Why This Number

- 각 signal은 `name`, `effect`, `asOfKst`, `sourceId`, `dataStatus`를 제공한다.
- confidence와 Data Health를 분리한다.
- 상세 근거가 없는 경우 임의 텍스트를 만들지 않는다.

### Gate & Duty-Free Flow

- Work 화면의 값은 `DEMO GATE WAVE`; 공식 시설 Directory가 알려주는 것은 위치·운영시간뿐이다.
- Production은 항공편별 공식 gate/terminal/changed time/status와 T1 출국장 대기를 결합한다.
- `CANCELLED`는 active flow 편수에서 제외한다. 지연은 변경시간 기준 Window로 재계산한다.
- T2 실시간 출국장 대기는 공식 미제공 기간 `NOT_AVAILABLE`이다.
- 결과는 `ZONE_FLOW_SIGNAL`이며 면세점 방문객·매출·구매전환으로 표시하지 않는다.
- 상세 Source/Schema/오류상태: [Gate & Retail Data Audit](/gate-retail-data-audit.md).

## 27. V5 SEO와 Route Handoff

- Work 구현: 4개 locale route, 7개 의미 있는 slug, 페이지별 title/description/canonical/hreflang, Open Graph, WebSite/WebApplication JSON-LD, `robots.txt`, `sitemap.xml`, 404, semantic heading, 내부 링크.
- Production 필수: 독립 도메인, route별 server-rendered `<html lang>`, Search Console/Bing 등록, sitemap 제출, 301 migration, Core Web Vitals 측정, OG용 1200×630 파생이미지.
- 상세 명세: [SEO Handoff](/seo-handoff.md).
- Handoff/QA 문서는 robots에서 제외하고 검색 Landing으로 사용하지 않는다.

## 28. Analytics Event Schema (privacy-respecting)

| Event | 최소 속성 |
|---|---|
| `area_select` | `area`, `locale`, `surface` |
| `period_select` | `period`, `surface` |
| `terminal_select` | `terminal`, `surface` |
| `airline_search` | `resultCount`, `locale` (검색어 원문 저장 금지 검토) |
| `flight_search` | `resultCount`, `direction`, `terminal` |
| `business_industry_select` | `area`, `industry`, `period` |
| `language_select` | `from`, `to`, `route` |
| `opening_brief_view` | `area`, `industry?`, `recordOrigin` |
| `why_pulse_open` | `area`, `targetDate`, `recordOrigin` |
| `history_view` | `metric`, `period`, `terminal?` |
| `pro_view` | `entrySurface`, `locale` |

IP 원문, 정확한 위치, 항공편 검색어, 개인식별정보를 분석 payload에 넣지 않는다.

## 29. V5 이미지·성능 Handoff

- Primary `/assets/seoul-hangang.jpeg`: AVIF/WebP 파생, 480/768/1200/1600 srcset, 고정 aspect-ratio, 필요한 route에서만 preload.
- Secondary `/assets/seoul-hanok.jpeg`: AVIF/WebP, lazy-load, 고정 width/height.
- 현 Work 이미지는 원본 비율과 focal point를 보존하며 필터를 추가하지 않았다.
- 12개월/ALL History, 전체 Airline/Flight list는 초기 Home payload에 포함하지 않고 route/interaction 시 load한다.
- 차트는 accessible summary text와 table/rows를 함께 제공한다.

## 30. Claude Code 다음 실행 순서

1. `wrangler types`로 실제 `Env`/D1/Fetcher binding 타입을 생성하고 Work의 최소 `types/cloudflare-workers.d.ts`를 생성 타입으로 교체한 뒤 `tsc --noEmit`을 CI release gate에 넣는다.
2. `/{locale}/{slug}`를 독립 Production Next/Cloudflare routing으로 옮기고 locale별 server `<html lang>`을 확정한다.
3. 사용자 보유 도메인 결정 후 Work URL → Production URL 301/canonical migration plan을 실행한다.
4. 인천공항 Forecast/Flight/출국장 혼잡 Key를 Secret Store에 연결하고 Contract fixture·schema validation·freshness를 구현한다.
5. 서울 외국인 생활인구·기상청·TourAPI collector를 연결하고 `recordOrigin`을 강제한다.
6. D+1 Forecast Archive를 시작하고 수정불가 `FORECAST_CAPTURED → OUTCOME` 연결을 만든다.
7. Work의 Demo Today/What Changed/Brief/Flight를 Live Worker endpoint로 교체하되 하나의 Source 실패가 전체 Site를 중단하지 않게 한다.
8. 320/375/390/430px와 KO/EN/ZH/JA visual regression, 키보드, screen-reader, 100+ flights virtual/list pagination test를 CI에 추가한다.
9. WebP/AVIF·font subset·route data split 후 LCP/CLS/INP를 측정한다.
10. Search Console/Bing, sitemap, canonical/hreflang, structured data를 독립 도메인에서 검증한다.
11. 충분한 Prospective 기간 전에는 실제 Forecast Accuracy·Harness Promotion을 공개하지 않는다.
12. 공식 시설 Directory의 자동화 조건을 확인하고 gate cluster map을 versioning한 뒤 구역 Flow를 Live로 교체한다.

## 31. V5 관련 문서

- [SEO Handoff](/seo-handoff.md)
- [Product Roadmap](/product-roadmap.md)
- [100-Point QA Report](/qa-report-v5.md)
- [Data Source Matrix](/data-source-matrix.md)
- [Historical Backfill Plan](/historical-backfill-plan.md)
- [Live Readiness](/live-readiness.md)
- [Gate & Retail Data Audit](/gate-retail-data-audit.md)

## 32. V5.5 Information Architecture 계약

### Navigation

- 표시 순서: `TODAY / AIRPORT / BUSINESS / INSIGHTS / MORE`.
- `INSIGHTS`는 기존 Forecast 기능을 삭제한 것이 아니라 7일 예측·지역 비교·What Changed·T1/T2 공식 History를 묶은 상위 문맥이다.
- 기존 SEO URL `/forecast`는 유지한다. Production에서 `/insights`로 바꾸려면 301·canonical·sitemap·hreflang를 같은 Release에서 함께 바꾼다.

### Home Command Center

- Level 1: Today Brief, Today/Tomorrow 지역 비교, Airport Now, Next 3 Hours, What Changed.
- Level 2: 빠른 실행을 통해 Area, Airport 문맥, Business, Insights, My RetailPulse로 이동.
- Level 3: Feature Discovery가 여섯 핵심 기능과 실제 진입점을 설명한다.
- Home의 공항 58,430명은 `DEMO_FORECAST / terminal=ALL`이며 T1/T2로 나누지 않는다.
- T1/T2 Home 행은 Live 연결 전 `NOT_CONNECTED`를 표시하고 공식 월별 History가 있다는 사실만 안내한다.

### Area

순서: `SUMMARY → WHY → HISTORY → GOOD TO KNOW → DATA`.

- WHY row 계약: `label`, `value`, `explanation`, `sourceId`, `recordOrigin`, `asOfKst`.
- 비교 계약: `currentValue`, `baselineValue`, `baselinePeriod`, `delta`, `isPartial`, `recordOrigin`.
- 현재 4-week 비교는 Demo이며 공식 과거값과 혼합하지 않는다.
- Data 상세에서 `DEMO DATA`와 `OFFICIAL HISTORICAL`의 의미를 문장으로 설명한다.

### Airport

상위 문맥은 `NOW / NEXT / FLIGHTS / HISTORY / AIRLINES`다.

- `NOW`: 오늘·내일 출입국, 누적, 피크, 여유시간. Terminal Demo가 없으면 N/A와 공식 월별 History 경로를 함께 제공.
- `NEXT`: 1/3/6시간·오늘 시간창 하나로 출발편, Airline, Route, T1/T2, Delay, Gate zone을 집계.
- `FLIGHTS`: 편명·항공사·도시·공항코드·Terminal·시간·상태 Filter. Global Search의 편명 결과는 이 문맥으로 직접 연결.
- `HISTORY`: Direction + Period + Terminal, 공식 Chart/Table/일평균/MoM/T1-vs-T2.
- `AIRLINES`: My Airlines, 시간대 편수, 노선, 공식 월별 Airline History.
- 문맥 상태는 사용자 탐색 상태이며 인덱싱용 얇은 URL을 만들지 않는다.

### Business

순서: `TOMORROW → WHY → OPENING BRIEF → ACTION → HISTORY → DATA`.

- Opening Brief는 2~3문장, Action은 한 줄 결론 + 1~2문장 설명.
- 정확한 직원 수·재고 수량·매출 증가를 지시하지 않는다.
- `WHY`의 Naver는 상대 클릭지수, 공항승객은 외국인 수가 아님을 유지한다.

### Local preference / Discoverability

- 저장 항목: `lang`, `area`, `terminal`, `industry`, `airlines`.
- 저장 실패는 기능 실패로 전파하지 않는다.
- Header Global Search는 지역·T1/T2·편명·항공사·업종 외에 History/Insights/Store 문맥도 검색한다.

## 33. V5.5에서 확인한 버그와 Production Gate

- 수정: T1/T2 Live 값이 N/A인데도 전체 공항 혼잡 문장을 그대로 노출하던 오류. Terminal 선택 시 `실시간 미연결 + 공식 월별 History 가능` 문장으로 교체.
- 수정: 중국어 Opening Brief 안에 한글 단어가 섞인 번역 오류.
- 수정: Airport/Insights/Business 가로 문맥 Navigation의 브라우저 Scrollbar 노출.
- Browser 8개 사용자 Journey 모두 통과, KO/EN/ZH/JA route·언어 유지·가로 Overflow(Desktop) 통과, App-origin console error 0건.
- Work Cloud Browser는 좁은 Viewport 전환을 제공하지 않아 실제 320/375/390/430px Device Visual은 `WORK_PLATFORM_LIMIT`. 반응형 CSS와 overflow guard는 구현했으며 Production CI의 실제 Device screenshot을 Release Gate로 둔다.
- 상세: [V5.5 QA Report](/qa-report-v5-5.md), [V5.5 Feature Map](/feature-map-v5-5.md).

## 34. V5.6 상세 기간·API 감사

- Airport와 Business History에 시작월·종료월 선택을 추가하고 선택 기간 기반 계산으로 교체했다.
- 현재 Runtime data API는 0개임을 Site와 Data Source Matrix에 명시했다. 공식 Historical 2개와 Demo 영역을 분리한다.
- 상세 검사 결과: [V5.6 Range & API QA](/qa-report-v5-6.md).

## 35. V5.7 Credential · 무료조건 · 고객오해 감사

- 현재 Runtime API는 계속 0개다. Secret이 Site에 없으며 Live 연결을 주장하지 않는다.
- 공항 최소 Live는 `DATA_GO_KR_SERVICE_KEY` 1개와 API 활용신청 3건(운항 상세, T1 출국장 혼잡, 입국장 현황)으로 고정한다.
- 기상청도 같은 공공데이터포털 프로젝트키를 선택하되 별도 활용신청한다. 서울 데이터는 `SEOUL_OPEN_DATA_KEY` 1개를 추가한다.
- 여객예고 공식 Web·Excel은 확인했으나 자동화용 API 계약은 미확인이라 `AUTOMATION_REVIEW`로 둔다.
- More의 Demo Health가 `Updated 12m ago`처럼 실제 Live freshness로 오해될 수 있던 결함을 제거하고, `Official Historical 2 / Live API 0` 연결 준비 상태로 교체했다.
- 입국장 현황을 Site Data Catalog에 추가하고 무료·개발한도·운영심의를 분리했다.
- SPA 언어·메뉴 전환 뒤 이전 Page Title·Canonical이 남던 결함을 수정했다. Client 상태 전환 시 Title, Description, Canonical, Hreflang, OG/Twitter 설명을 현재 URL과 동기화한다.
- 외부 API는 무료여도 timeout·rate limit·schema 변경 가능성이 있으므로 `timeout → retry+jitter → schema validation → last-known-good → stale label → source-only fallback`을 Release Gate로 둔다.
- 외부 고객 공개범위는 현재 Work Site access 정책을 별도로 확인해야 하며, 권한변경은 Owner의 명시적 승인 없이 수행하지 않는다.
- 상세 근거: [API Key · Free Use Audit](/api-key-audit.md), [V5.7 Credential & Customer QA](/qa-report-v5-7.md).
# V5.8 critical correction — 2026-08-23

The previous Demo forecast scoreboard has been removed from the product UI. It must not return. Public accuracy remains unavailable until at least 30 resolved prospective target dates across four continuous weeks. Model promotion requires at least 90 prospective days plus a documented baseline advantage. `OFFICIAL_HISTORICAL` and `BACKFILLED` records are never prospective evidence.

A D1-backed public-beta signup flow is now included. Binding: `DB`. Table: `beta_signups`. Routes: `POST /api/beta-signups` and self-service `DELETE /api/beta-signups`. It stores normalized email, interest segment, locale, source path, consent version, and timestamps; duplicate emails update preferences. There is no public list endpoint. Email delivery, unsubscribe handling, and analytics remain `HANDOFF_REQUIRED`.

The current Sites access mode was audited as custom owner-only. This blocks anonymous acquisition and SEO. Changing it to public requires explicit owner approval and must be verified in a signed-out browser. See `/growth-validation-plan.md`.

# V5.8.1 custom-period correction — 2026-08-23

The previous V5.6 source-only QA missed a functional defect: changing native month inputs did not reliably update the range committed on submit. V5.8.1 uses explicit month selects and reads `startMonth` / `endMonth` from the submitted form before updating Airport or Business history state. Keep this contract in Production and add a real browser regression, not only source-string assertions. Mobile period controls must keep all presets and the custom action visible without horizontal discovery.
