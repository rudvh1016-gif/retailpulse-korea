# RetailPulse Seoul — Data Source Matrix

> V6.1 product name: **RetailPulse Korea · Seoul (RPK)**. Last policy verification: 2026-08-24 KST. The current Work site calls zero external public-data APIs at visitor runtime; official historical aggregates remain bundled separately.

## V6.1 production classification

| sourceId | provider / official source | status | key / approval | quota / lag | production role | failure behavior |
|---|---|---|---|---|---|---|
| `icn_flight_detail` | Incheon International Airport Corp. — aircraft operation detail | `GREEN_FREE_APPROVAL` | data.go.kr project key; dev auto, ops review | D-3 to D+6; official quota | terminal, gate, check-in, status, flight wave | keep history; live flights N/A |
| `icn_departure_hall` | Incheon Airport departure-hall status / congestion | `GREEN_FREE_APPROVAL` | same project key; API application required | frequent; T1 checkpoint scope verified, T2 not assumed | T1 checkpoint wait/context | T2 shows official-data unavailable; no copying T1 |
| `icn_arrival_hall` | Incheon Airport arrival-hall status | `GREEN_FREE_APPROVAL` | same project key; API application required | near real time | arrival hall/flight context | live N/A; no inferred visitors |
| `icn_passenger_outlook` | Incheon Airport expected congestion page/Excel | `CONDITIONAL` | public view; automated collection terms review | daily 17:00; departure D+2, arrival/transfer D+1 | airport context / official forecast | use last valid with stale label or omit |
| `icn_statistics` | Incheon Airport official statistics | `GREEN_FREE` | no key for public download | monthly/annual final | official historical | bundled history remains available |
| `seoul_short_foreigner` | Seoul short-stay foreign living population | `GREEN_FREE` | key for recent API; files public | recent two months; legacy dong series ended 2026-07 pending grid migration | history, deep outcome, feature after availability | keep last official history; mark series transition |
| `seoul_realtime_city` | Seoul real-time city data | `GREEN_FREE_APPROVAL` | Seoul key | one place/call; frequent updates | fast outcome / area context | reduce freshness and confidence |
| `kma_forecast_actual` | Korea Meteorological Administration | `GREEN_FREE_APPROVAL` | data.go.kr key / application | product-specific | forecast feature + separate actual outcome | remove weather feature, lower confidence |
| `kto_tourism` | Korea Tourism Organization APIs/Data Lab | `CONDITIONAL` | product-specific key/terms | product-specific | only validated visitor/event signals | exclude source; never scrape UI |
| `seoul_kt_movement` | Seoul/KT purpose-classified living movement | `RESEARCH_ONLY` until commercial reuse and mapping are reconfirmed | file/account-specific | delayed batch | candidate deep outcome | never expose raw rows or use in live score |
| `naver_datalab` | Naver DataLab API | `CONDITIONAL` | separate client credentials | documented quota | optional relative trend only | remove; never call it sales |
| `telco_card_private` | commercial telecom/card raw data | `EXCLUDED_PAID` | contract | paid | competitor reference only | no paid fallback |
| `store_outcome` | future consented store aggregates | `BLOCKED` | partner consent and data contract | future | STORE verification | zero records; no sales-accuracy claim |

### Gate and duty-free truth

The official flight-detail source can provide a flight's terminal, gate, check-in counter and status. The airport congestion sources can provide checkpoint/time context within their published scope. These can support a **gate-area flight-flow proxy** after production collection. They do not provide duty-free store entry counts, dwell time, transactions or sales. RPK must say “nearby scheduled flight flow” and must not label it “the busiest duty-free shop”.

기준일: 2026-08-23 KST
원칙: 무료 조회, 무료 API, 무료 상업 이용, 재배포 권리는 서로 다른 항목으로 관리한다. `READY`는 화면 Live 연결 완료가 아니라 Production 수집 후보 검증 상태다.

## 현재 공개 Site의 실제 Runtime 감사

| 구분 | 현재 개수 | 실제 상태 |
|---|---:|---|
| 방문 시 직접 호출하는 외부 관광·공항·서울 데이터 API | **0개** | 현재 Frontend에는 공공데이터 `fetch`/SDK 호출이 없다. Live 연결 완료를 주장하지 않는다. |
| Site에 내장해 실제 사용하는 공식 Historical 집계 | **2개 Source** | 인천공항 공식 월별·연간 실적, 서울 단기체류 외국인 생활인구 월별 집계 |
| 내장된 Demo 데이터군 | **5개** | 지역 Today/Tomorrow·7일 Pulse, 공항 Today/Tomorrow, Flight/Gate Wave, Business 신호·Action, Forecast Performance |
| 감사한 Production 연동 후보 | **18개** | Site Source Catalog의 READY/KEY_REQUIRED/AUTOMATION_REVIEW/CONDITION_REVIEW 상태. `READY`도 현재 Runtime 연결을 뜻하지 않는다. |

### Runtime 요청의 의미

- Cloudflare Worker의 `ASSETS.fetch`와 `IMAGES` binding은 이 Site 자체의 정적 파일·이미지를 전달하는 내부 요청이다. 공항·관광 데이터 API가 아니다.
- Pretendard(jsDelivr), Noto Sans JP/SC(Google Fonts)는 표시용 폰트 자산 요청이다. 관광·공항·서울 데이터 API가 아니다.
- 오늘·내일 공항값, 항공편, 출국장·게이트 Wave, 지역 Pulse, Business 수요신호는 **DEMO**다.
- 공항 2025.08–2026.07 월별 상세·선택 연도 장기 참고값과 외국인 생활인구 2025.01–2026.07 월별 집계는 **OFFICIAL HISTORICAL**이다.
- Live 전환 시에는 Frontend에 Secret을 두지 않고 Production Collector/Backend가 API를 수집·검증·정규화한 뒤 Frontend가 RetailPulse 자체 Endpoint만 읽는다.

### Key 개수와 활용신청 개수

- 공항 최소 Live: `DATA_GO_KR_SERVICE_KEY` **1개** + 운항 상세·출국장 혼잡·입국장 현황 **활용신청 3건**.
- 기상청 단기예보: 같은 공공데이터포털 프로젝트키를 선택하되 **별도 활용신청 1건**.
- 서울 최근/실시간 데이터: `SEOUL_OPEN_DATA_KEY` **1개**.
- 인천공항 여객예고: 공식 Web·Excel은 공개되지만 자동화 API 계약은 미확인이라 Key 수에서 제외.
- 세부 근거: [API Key · Free Use Audit](/api-key-audit.md).

## 상태 정의

- `READY`: 공식 접근법과 제품 용도가 확인됨
- `KEY_REQUIRED`: 무료 공공 API이나 활용신청 또는 키가 필요함
- `AUTOMATION_REVIEW`: 공식 조회·Download는 확인했으나 자동수집 API·이용조건이 확인되지 않음
- `BACKFILL_AVAILABLE`: 공식 과거 파일/API가 확인됨
- `LIVE_ONLY`: 현재값은 있으나 과거는 자체 Snapshot 필요
- `HISTORICAL_ONLY`: 확정 과거 실적용
- `CONDITION_REVIEW`: 상업 이용·재배포·자동화 조건 추가 확인 필요
- `NOT_SELECTED`: V1 핵심 의존성에서 제외
- `BLOCKED`: 접근권한이나 공식 자동화 수단이 없어 현재 구현 불가

## 운영 데이터 카탈로그

| Source | 제공기관 | RetailPulse 용도 | Realtime / Historical | 확인 범위 | 갱신·지연 | 공간·단위 | Key | 무료 | 상업/재배포 | 상태 | 우선순위 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [인천공항 여객예고](https://www.airport.kr/ap_ko/883/subview.do) | 인천국제공항공사 | 오늘·내일 여객, 시간대 혼잡, T1/T2 | 공식 Web·Excel / 캡처 후 Archive | 출국 D+2, 입국·환승 D+1 안내 | 매일 17:00 | 전체·T1·T2 / 명 | 공개페이지상 Key 없음 | 공개 조회·Excel | 자동수집·재배포 조건 확인 | `AUTOMATION_REVIEW` | P0 |
| [인천공항 공식 통계](https://www.airport.kr/co_ko/651/subview.do) | 인천국제공항공사 | 월·연·요일·시간·항공사·지연·결항 실적 | Historical | 전체 2010.01–2026.07 확인, T2 2018.01– | 월 통계 익월 5영업일 이후 | 전체·T1·T2 / 명·편 | 없음 | 공개 조회·Excel | 출처표시, Aggregate 중심 | `BACKFILL_AVAILABLE` | P0 |
| [인천공항 입국장 현황](https://www.data.go.kr/data/15095061/openapi.do) | 인천국제공항공사 | 입국장·도착편·게이트·내외국인 대기인원 | Live / 자체 Archive | H-2~H+2, T1/T2 | 준실시간 | 터미널·입국장·항공편 | data.go.kr 프로젝트키·별도 신청 | 무료, 개발 500회/일 | 이용허락 제한없음, 운영심의 | `KEY_REQUIRED` | P0 |
| [인천공항 운항 상세](https://www.data.go.kr/data/15140153/openapi.do) | 인천국제공항공사 | 편명·항공사·터미널·게이트·체크인·상태 | D-3~D+6 / Historical stats | D-3~D+6 | 준실시간 | 항공편 / 편 | data.go.kr 프로젝트키·별도 신청 | 무료, 개발 500회/일 | 이용허락 제한없음, 운영심의 | `KEY_REQUIRED` | P0 |
| [인천공항 출국장 혼잡도](https://www.data.go.kr/data/15148225/openapi.do) | 인천국제공항공사 | 출국장 1~6번·동서측 대기인원 | 현재 1분 / 자체 Archive | **T1만**, T2 추후 제공 예정 | 약 1분 | T1·출국장·동서측 / 명 | data.go.kr 프로젝트키·별도 신청 | 무료, 개발 1,000회/일 | 이용허락 제한없음, 운영심의 | `KEY_REQUIRED` | P0 |
| [인천공항 면세점 안내](https://www.airport.kr/ap_ko/1003/subview.do) | 인천국제공항공사 | 운영사·매장·영업시간·게이트 인접 위치 | Directory / 변경 Snapshot | T1·T2·탑승동 | 변경 시 | 시설·게이트 인근 | Directory는 없음 | 공개 조회 | 자동화·파생메타 재배포 조건 확인 | `CONDITION_REVIEW` | P1 |
| [서울 단기체류 외국인 생활인구](https://data.seoul.go.kr/dataList/OA-14993/S/1/datasetView.do) | 서울특별시 | 명동·홍대·성수 외국인 생활인구 | 최근 API / 월별 파일 | 2017.01–2026.07 확인 | 월별, 최근 API는 최근 2개월 | 행정동·시간 / 명 | 최근 API 필요 | 공개 파일/API | 공공누리 1유형, Aggregate 재배포 | `BACKFILL_AVAILABLE` | P0 |
| [서울 250m 체류인구](https://data.seoul.go.kr/dataList/OA-22786/S/1/datasetView.do) | 서울특별시 | 2026.08 이후 외국인 공간범위 대체 | Current / 향후 Archive | 2026.08 이후 전환 대상 | 상품별 | 250m Grid | 확인 필요 | 공개 데이터 | 조건 확인 | `CONDITION_REVIEW` | P0 |
| [기상청 단기예보](https://www.data.go.kr/data/15084084/openapi.do) | 기상청 | 판단시점 예보 날씨 | Forecast / 캡처 후 Archive | 전국 5km 격자 | 발표주기별 | 격자 / 기온·강수 등 | 같은 data.go.kr 프로젝트키·별도 신청 | 무료, 개발 10,000회/일 | 공공저작물 제1유형 출처표시, 운영 자동승인 안내 | `KEY_REQUIRED` | P0 |
| [기상청 ASOS 시간자료](https://data.go.kr/data/15057210/openapi.do) | 기상청 | 과거 실제 날씨의 설명 분석 | Historical observation | 지점별, 장기 관측 | 시간 | 관측소 / 기상요소 | 필요 | 무료, 개발 10,000건 안내 | 공공누리 1유형 | `BACKFILL_AVAILABLE` | P1 |
| [한국관광 데이터랩](https://datalab.visitkorea.or.kr/) | 한국관광공사 | 관광수요·방문·소비·다양성 후보 | 상품별 | 상품별 확인 필요 | 상품별 | 시군구·관광지 등 | 상품별 | 조회 가능 | 웹화면 스크래핑 금지, API/공식 Download만 | `CONDITION_REVIEW` | P0/P1 |
| [TourAPI](https://api.visitkorea.or.kr/) | 한국관광공사 | 행사·관광지·숙박·다국어 POI | API / 상품별 History | 상품별 | 상품별 | POI·지역 | 필요 | 무료 한도 | 상품별 조건 | `KEY_REQUIRED` | P1 |
| 서울 실시간 도시데이터 | 서울특별시 | Today Area Pulse, 혼잡·교통 | Live / 자체 Snapshot | 현재값 | 준실시간 | Hotspot | 필요 | 무료 한도 | 서울 열린데이터 조건 | `LIVE_ONLY` | P1 |
| [서울×KT 수도권 생활이동](https://data.seoul.go.kr/dataList/OA-22300/F/1/datasetView.do) | 서울특별시·KT | 쇼핑·관광 목적 이동 후보 | Historical files | 배포파일별 확인 | Batch | 행정구역·시간 | 없음 | 공개 파일 | 데이터셋 조건 재확인 | `CONDITION_REVIEW` | P3 |
| [서울 지하철 시간대별 승하차](https://data.seoul.go.kr/dataList/OA-12252/S/1/datasetView.do) | 서울특별시 | 명동역·홍대입구역·성수역 Area Pulse 보조 | 월별 History | 공식 파일/API 상품 범위 | 매월 5일 전월 갱신 | 역·시간 / 명 | 상품별 | 공개 데이터 | 열린데이터 조건 | `BACKFILL_AVAILABLE` | P1 |
| [서울 지하철 일별 승하차](https://data.seoul.go.kr/dataList/OA-12914/S/1/datasetView.do) | 서울특별시 | 일간 지역 흐름 보조 | 최근 API / 파일 History | Sheet 최근 1개월 안내 | D-3 갱신 | 역·일 / 명 | 상품별 | 공개 데이터 | 열린데이터 조건 | `BACKFILL_AVAILABLE` | P1 |
| [서울 상권 추정매출](https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do) | 서울신용보증재단 | 장기 상권체급·업종 계절성 | Quarterly Historical | 2021–2025 파일 확인 | 분기 | 상권·업종 / 원 | Open API 상품 | 공개 데이터 | 공공누리 1유형 | `BACKFILL_AVAILABLE` | P1 |
| [한국은행 ECOS](https://ecos.bok.or.kr/api/) | 한국은행 | USD/CNY/JPY 환율 후보 | Scheduled / Historical | 계열별 | 계열별 | 전국 / 환율 | 필요 | 무료 API | 조건 확인 | `READY` | P1 |
| [천문연 특일](https://www.data.go.kr/data/15012690/openapi.do) | 한국천문연구원 | 공휴일·특일 Feature | Calendar / Historical | 연도별 | 연 단위 | 전국 / 날짜 | 필요 | 무료 한도 | 조건 확인 | `KEY_REQUIRED` | P1 |
| [Naver DataLab](https://developers.naver.com/products/service-api/datalab/datalab.md) | Naver | 검색 상대 관심도 후보 | Query / Historical range | API 정의 범위 | 일 단위 | 키워드 / 상대지수 | Client ID/Secret | 무료 한도 | API 약관 | `KEY_REQUIRED` | P2 |
| [Naver Shopping Insight](https://developers.naver.com/docs/serviceapi/datalab/shopping/shopping.md) | Naver | 쇼핑 클릭 상대 관심도 후보 | Query / Historical range | API 정의 범위 | 일 단위 | 카테고리·키워드 / 상대지수 | Client ID/Secret | 일 1,000회 안내 | 실제 판매액 아님, 약관 확인 | `KEY_REQUIRED` | P2 |
| [SKT Geovision Puzzle](https://puzzle.geovision.co.kr/faq) | SKT | 유동·이동 교차검증 후보 | Plan별 | Plan별 | Plan별 | 서비스 정의 | 계정 | 무료 Plan 존재 | 재배포 사전허가 필요 | `CONDITION_REVIEW` | P3 |
| [KT PLIP](https://enterprise.kt.com/pd/P_PD_AI_BD_003.do) | KT | 이동·생활인구 후보 | 계약별 | 계약별 | 계약별 | 서비스 정의 | 계약 | 무료 Runtime으로 전제하지 않음 | 계약조건 | `NOT_SELECTED` | P3 |

## 한국관광공사 Pool 감사

아래 항목은 데이터랩 화면 존재 여부와 제품 의미는 확인했지만, 자동화용 공식 API/Download의 정확한 시작일·Quota·재배포 범위를 상품별로 다시 승인받아야 한다. 그 전에는 화면을 크롤링하지 않는다.

| 후보 | Granularity | Historical access | Live access | 현재 판정 |
|---|---|---|---|---|
| 지역별 관광 수요 강도·체류 강도·소비 강도 | 지역·기간 | 공식 Download/API 확인 필요 | 상품별 | `CONDITION_REVIEW` |
| 지역별 방문자수 | 지역·기간 | 데이터랩/공식 상품 | 상품별 | `CONDITION_REVIEW` |
| 관광 다양성·자원 수요 | 지역·기간 | 공식 Download/API 확인 필요 | 상품별 | `CONDITION_REVIEW` |
| 관광지 집중률 예측 | 관광지·시간 | 예측상품 정의 확인 필요 | 상품별 | `CONDITION_REVIEW` |
| 연관 관광지 | POI 관계 | 공식 API/Download만 | 상품별 | `CONDITION_REVIEW` |
| 행사·축제·관광지·숙박 | POI·기간 | TourAPI 상품별 | API | `KEY_REQUIRED` |
| 한국어·English·简体中文·繁體中文·日本語 TourAPI | POI | 상품별 | API | `KEY_REQUIRED` |

## Data Truth 고정 규칙

- 공항 전체승객 ≠ 외국인 관광객
- 항공사 코드·항공사 국적·목적지 국가 ≠ 승객 국적
- 항공편 수 ≠ 승객 수, 좌석 수 ≠ 실제 탑승객 수
- 서울 단기체류 외국인 생활인구 ≠ 방문자수·매출
- 지하철 승하차 ≠ 외국인
- 서울 상권 추정매출 ≠ 외국인 소비
- Naver Shopping Insight ≠ 판매액
- 과거 실제 날씨 ≠ 당시 예보 날씨
- Backfill Actual ≠ 당시 저장된 Forecast
- 출국장 대기·게이트 출발편 집중도 ≠ 면세점 방문객·매출
- T1 출국장 1분값 ≠ T2 출국장값; T2 미제공 기간은 `NOT_AVAILABLE`
