# RetailPulse Seoul — Historical Backfill Plan

기준일: 2026-08-22 KST  
목적: 가능한 과거자료를 분석에 쓰되, 원본 대용량 파일을 Site bundle·Git History·Cloudflare 단일 KV에 누적하지 않는다.

## 이번 Work에서 실제 확보·반영한 범위

### 1. 인천공항 공식 실적

- 공식 Source: [인천공항 통계](https://www.airport.kr/co_ko/651/subview.do)
- Site 반영 월: **2025.08–2026.07**, 전체·T1·T2, 입국·출국·전체여객
- 직접 검증 월: **2026.01, 02, 03, 04, 05, 06, 07**, **2025.08–12**
- 공식 장기 Coverage 확인: **2010.01–2026.07**
- T2 별도 통계 확인: **2018.01–2026.07**. 2018년 이전은 `NOT OPERATING`, 0으로 저장 금지
- Site 장기 Reference 반영: 2010, 2019–2025 연간 전체여객
- Published status: 완료월은 `PUBLISHED_FINAL`. 현재 미완료월을 완료월과 직접 비교하지 않음

### 2. 서울 단기체류 외국인 생활인구

- 공식 Source: [서울 열린데이터 OA-14993](https://data.seoul.go.kr/dataList/OA-14993/S/1/datasetView.do)
- 실제 내려받아 집계한 파일: **2025년 1–12월, 2026년 1–7월**
- 공식 파일 Coverage 확인: **2017.01–2026.07**
- 2026년 월 ZIP 크기: 월 약 4MB 압축, 약 17MB CSV
- Site 반영값: 월별 `시간당 평균 단기체류 외국인 생활인구`
- 지역 Mapping:
  - 명동: `11140550` 명동
  - 홍대 MVP 범위: `11440660` 서교동
  - 성수: `11200650`, `11200660`, `11200670`, `11200690` 합계
- 2026.07 추가 분석: Peak hour, Peak weekday, 공식 중국인 분류 평균·비중
- 2026.08 이후: 기존 행정동 데이터 생산 종료 안내에 따라 [250m Grid 데이터](https://data.seoul.go.kr/dataList/OA-22786/S/1/datasetView.do)로 경계 Mapping을 새로 승인해야 함

## Source별 Backfill Manifest

| Source | Earliest | Latest | Method | 예상 크기 | Priority | License/조건 | Storage | Aggregation | Known gaps |
|---|---:|---:|---|---:|---|---|---|---|---|
| 인천공항 월별 시계열 | 2010.01 | 2026.07 | 공식 통계 Query/Excel | 소형 | P0 | 공식 출처표시 | 월 파티션 | terminal×direction×month, dailyAverage | 월 확정은 익월 5영업일 이후 |
| 인천공항 T1/T2 | T1 2010.01, T2 2018.01 | 2026.07 | passenger aircraft terminal stats | 소형 | P0 | 공식 출처표시 | 월 파티션 | terminal share, MoM, YoY | T2 이전 `NOT_OPERATING` |
| 인천공항 요일·시간대 | 공식 페이지 제공범위 | Latest published | 공식 Excel | 중형 | P0 | 공식 출처표시 | 연/월 파티션 | weekday/hourly average | 실제 파일 범위는 Script 실행 시 Manifest 갱신 |
| 인천공항 항공사 | 공식 페이지 제공범위 | Latest published | 공식 Excel | 중형 | P0 | 공식 출처표시 | 연/월 파티션 | airline×terminal×direction×month | 실시간 승객 예상으로 변환 금지 |
| 인천공항 지연·결항 | 공식 페이지 제공범위 | Latest published | 공식 Excel | 중형 | P1 | 공식 출처표시 | 연/월 파티션 | airline/route/hour patterns | 2023-01-01 지연 정의 변경 Flag 필요 |
| 외국인 생활인구 행정동 | 2017.01 | 2026.07 | 월/연 ZIP | 월 4MB 압축 내외 | P0 | 공공누리 1유형 | ETL 임시파일 후 삭제 | area×date×hour, monthly/weekday/hourly | 2026.08 데이터 체계 전환 |
| 외국인 체류인구 250m | 2026.08 전환 | Current | 공식 File/API | 대형 가능 | P0 | 조건 확인 | Object storage 임시 | area polygon×grid | 과거 행정동 Series와 연속성 Calibration 필요 |
| 서울 지하철 시간대별 | 상품별 | Latest | File/Open API | 중형 | P1 | 서울 열린데이터 조건 | 월 파티션 | station×date×hour | 홍대입구는 복수 운영기관 합산정책 필요 |
| 서울 상권 추정매출 | 2021 | 2025 published | 연 ZIP/Open API | 연 12–14MB 압축 확인 | P1 | 공공누리 1유형 | ETL 임시파일 | area×industry×quarter | 외국인 매출 아님, 2024 공간기준 변경 |
| KMA ASOS 관측 | 지점별 1904.04 이후 가능 | Current | 무료 Open API | Query형 | P1 | 공공누리 1유형 | 월 파티션 | day/hour weather | 설명 분석만; Forecast backtest input 아님 |
| KMA 당시 예보 Archive | 확인 필요 | Launch 이후 확실 | 매 발표시점 Capture | 소형 | P0 | 공공 API 조건 | issue-time 파티션 | forecastIssuedAt×targetHour | 과거 관측치로 대체 금지 |
| KTO 지표 | 상품별 | 상품별 | 공식 API/Download만 | 미정 | P0/P1 | 상품별 | 상품별 파티션 | geo×period | `CONDITION_REVIEW`, 웹 Scraping 금지 |
| Naver DataLab | API 정의범위 | Query date | API | 소형 | P2 | API 약관 | 주/월 Feature | relative index | 판매액 아님, 상관 검증 전 Candidate |
| ECOS 환율 | 계열별 | Current | API | 소형 | P1 | API 조건 | 일 파티션 | daily/rolling | 직접 인과 주장 금지 |
| 공휴일·특일 | API 연도범위 | Future published | API | 매우 소형 | P1 | 공공 API 조건 | Calendar table | holiday flags | 없음 |

## Production ETL 순서

1. Source metadata와 라이선스 Snapshot 저장
2. Raw를 임시 디렉터리/Object storage에 내려받기
3. SHA-256, 파일명, Source updated date, RetrievedAt 기록
4. Schema validation 실패 시 기존 정상 Aggregate 유지
5. 명동·홍대·성수와 필요한 지표만 Normalization
6. Daily/Weekly/Monthly/Weekday/Hourly/Rolling7/Rolling28/YoY 생성
7. Aggregate 검증 후 Raw 삭제 또는 보존정책에 따라 만료
8. Frontend에는 Summary와 요청한 기간 Chunk만 제공

## 권장 Script

```text
collect_airport_forecast.py
collect_airport_flights.py
backfill_airport_history.py
backfill_airport_airlines.py
backfill_foreign_population.py
collect_foreign_population_grid.py
collect_weather_forecast.py
backfill_weather_observed.py
collect_tourism.py
collect_subway.py
normalize_retailpulse.py
compute_pulse.py
update_outcomes.py
run_evolution_lab.py
```

## Record origin

```text
OFFICIAL_HISTORICAL  공식 확정 과거실적
LIVE_OBSERVED        Production 연결 후 관측·Snapshot
FORECAST_CAPTURED    판단시점에 실제 저장한 예측
BACKFILLED           과거에 사후 적재한 레코드
DEMO                 기능 검증용 예시
```

`FORECAST_CAPTURED → OUTCOME`만 Prospective 성능증거다. `OFFICIAL_HISTORICAL`과 `BACKFILLED`는 설명·Baseline·Backtest 연구에는 사용 가능하지만 당시 예측기록으로 바꾸지 않는다.

## Storage 제안

```text
airport/current
airport/forecast/2026-08-23
airport/daily/2026-08
airport/monthly
airport/airlines/2026-07
area/myeongdong/foreign/monthly
area/hongdae/foreign/monthly
area/seongsu/foreign/monthly
metadata/source-health
```

정확한 Cloudflare KV/R2/D1 선택은 실제 Aggregate 크기와 조회패턴을 측정한 뒤 결정한다. History 전체를 하나의 JSON으로 저장하지 않는다.
