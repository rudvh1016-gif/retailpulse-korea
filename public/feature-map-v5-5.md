# RetailPulse Seoul V5.5 기능 지도

기준: 2026-08-23 KST · V5 Source of Truth 감사 후 V5.5 정보구조 결정

## 결정 요약

- Bottom Navigation은 `TODAY / AIRPORT / BUSINESS / INSIGHTS / MORE`로 정리한다.
- 기존 `/forecast` URL과 7일 예측 기능은 삭제하지 않고 `INSIGHTS`의 핵심 상세로 유지한다.
- Home은 기능을 모두 펼치는 대시보드가 아니라 `오늘 브리프 → 오늘/내일 지역 비교 → 공항 요약 → 다음 3시간 → 변화 → 빠른 실행` 순의 Command Center로 만든다.
- Airport는 `NOW / NEXT / FLIGHTS / HISTORY / AIRLINES` 다섯 문맥으로 분리한다.
- Business는 `TOMORROW / WHY / OPENING BRIEF / ACTION / HISTORY / DATA` 순서로 읽히게 한다.
- Area는 `SUMMARY / WHY / HISTORY / GOOD TO KNOW / DATA` 순서로 정리한다.
- 중복 정보는 삭제하지 않고 Home에는 Summary, 각 상세 화면에는 근거와 방법을 둔다.

## 기능별 지도

| 기능 | 주 사용자 | 목적 | V5 진입점 | V5 발견성 | V5.5 역할·위치 |
|---|---|---|---|---|---|
| 오늘·내일 지역 펄스 | 관광객, 매장 운영자 | 명동·홍대·성수 우선순위 판단 | Home 날짜 탭 | 보통 | Home에 오늘/내일을 동시에 비교하고 Area 상세로 연결 |
| Area Detail | 관광객 | 점수 의미, 추천시간, 행동 팁 확인 | 지역 순위 행 | 보통 | Summary→Why→History→Good to know→Data |
| 7일 예측 | 관광객, 운영자 | 주간 흐름·강한 날 확인 | Forecast 하단 메뉴 | 보통 | Insights 핵심 상세, 기존 `/forecast` 유지 |
| Today Brief | 모든 사용자 | 오늘 핵심 변화 빠르게 파악 | Home 중단 | 보통 | Home 최상단 Command Center 요약 |
| What Changed | 재방문자 | 어제 대비 변화 확인 | Home 중단 | 보통 | Home과 Insights 요약에서 반복 노출 |
| Airport Now | 관광객, 공항·리테일 | 오늘·내일 출입국 흐름 확인 | Airport 긴 페이지 상단 | 높음 | Airport `NOW`, Home에는 1단 요약 |
| T1/T2 | 관광객, 공항·리테일 | 터미널 차이 확인 | Airport 상단 | 높음 | Airport 전체 문맥에 유지, Home 빠른 실행 제공 |
| Flight Wave | 공항·리테일 | 1/3/6시간 출발편 집중 확인 | Airport 중단 | 낮음 | Airport `NEXT`, Home에 Next 3 Hours 요약 |
| 게이트·면세구역 흐름 | 공항·리테일 | 게이트 구역의 항공편 집중도 확인 | Airport 하단 | 낮음 | Airport `NEXT` 안에 포함, 매장 방문객·매출 아님을 유지 |
| Flight Search | 관광객 | 편명·도시·항공사·게이트 확인 | Airport 최하단 | 낮음 | Airport `FLIGHTS`, Global Search의 편명 결과와 직결 |
| Airport History | 분석 사용자 | 6/12개월·전체 공식 흐름 확인 | Airport 중단 | 낮음 | Airport `HISTORY`, 기간·지표·Insight를 한 문맥에 배치 |
| Airline Intelligence | 공항·리테일 | 항공사별 편수·노선·상태 확인 | Airport 중단 | 낮음 | Airport `AIRLINES`, My Airport와 함께 배치 |
| My Airport | 반복 사용자 | 선호 터미널·항공사 저장 | Airport 항공사 행 | 낮음 | Airport `AIRLINES`와 More 개인화 요약에서 설명 |
| Business 6업종 | 매장 운영자 | 업종별 내일 수요·운영 준비 | Business | 높음 | 내일 Summary 다음에 Why·Brief·Action·History 순으로 정리 |
| Opening Brief | 매장 운영자 | 개점 전 우선 준비 파악 | Business 중단 | 보통 | 2~3문장 설명과 행동별 근거를 추가 |
| Business History | 매장 운영자 | 최근 3/6/12개월 신호 이해 | Business 탭 | 보통 | History 탭 유지, 현재 판단과 연결하는 문장 강화 |
| Forecast Performance | 분석 사용자 | Demo 평가 구조 이해 | Business 탭 | 낮음 | Insights와 Business의 Advanced 성격 유지 |
| Why This Number | 초보·전문 사용자 | 점수 구성·신뢰·데이터 상태 이해 | Area 하단 Details | 낮음 | Area `WHY` 바로 아래 상세 펼침으로 이동 |
| Global Search | 모든 사용자 | 기능·지역·편명 빠른 이동 | Header | 높음 | placeholder와 Section 결과를 강화, 편명은 Flights 문맥으로 연결 |
| My RetailPulse | 재방문자 | 지역·터미널·항공사·업종·언어 기억 | More | 낮음 | Home 빠른 실행과 More 상단 Feature Discovery에서 안내 |
| Data Sources / Truth | 신뢰 확인 사용자 | Demo·공식·지연·조건 이해 | More | 보통 | 일반 설명과 Advanced 기술정보를 분리 |
| Feature Discovery | 신규 사용자 | 사이트 전체 능력 이해 | 없음 | 없음 | Home 하단 및 More 상단에 실제 기능 링크 6개 제공 |

## 중복 정보 역할

| 정보 | Summary 위치 | Detail 위치 |
|---|---|---|
| 오늘·내일 지역 순위 | Home | Area / Insights |
| 공항 오늘 상태 | Home | Airport `NOW` |
| 다음 3시간 항공편 | Home | Airport `NEXT` / `AIRLINES` |
| 어제 대비 변화 | Home | Insights |
| 업종 준비 | Home Quick Action | Business |
| 과거 비교 | Insights Highlight | Area / Airport / Business History |

## 목표 사용자 여정

1. 오늘 명동 추천시간: Home `TODAY` → 명동 → Area Summary, 2회 이내.
2. 내일 홍대: Home `TOMORROW` → 홍대, 2회 이내.
3. T2 오늘 상태: Home `T1/T2 비교` 또는 Airport → T2, 2회 이내.
4. KE703 게이트: Header Search → KE703, 2회 이내에 Airport `FLIGHTS` 결과.
5. 향후 3시간 대한항공: Airport → NEXT → NEXT 3H, 3회 이내.
6. 최근 6개월 T1/T2: Airport → HISTORY → 6개월, 3회 이내.
7. 명동 화장품 매장 준비: Home `매장 준비` → 명동·뷰티, 3회 이내.
8. 어제와 오늘 변화: Home `WHAT CHANGED`, 스크롤 1회 이내.

