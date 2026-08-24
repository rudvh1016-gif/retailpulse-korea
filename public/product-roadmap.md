# RetailPulse Seoul — Product Roadmap V5

기준일: 2026-08-23 KST  
원칙: Runtime LLM API 비용 0원, 공공 무료 API·오픈데이터·Python·GitHub Actions·Cloudflare Free 중심.

## NOW — Work Site에서 끝낸 것

| 영역 | 완료 내용 |
|---|---|
| Product | Today/Tomorrow, 7 Days, Airport, Business, More, Opening Brief, What Changed, Why This Number, Global Search, Share Pulse, My RetailPulse |
| Data | OFFICIAL HISTORICAL / DEMO / FORECAST / BACKFILL 구분, 출처·기간·Coverage, T1/T2 임의배분 금지 |
| Forecast | Demo Pulse와 confidence 구조, 4주 기준 비교 구조, Prospective 증거 전 성과과장 금지 |
| SEO | 4 locale route, 고유 metadata, canonical/hreflang, robots, sitemap, OG, JSON-LD, 404 |
| Traffic | 측정 Event schema와 Search Console handoff 정의 |
| Monetization | Pro Preview만 유지, 결제·확정가격 없음 |
| Airport | ALL/T1/T2, 공식 월별 History, Airline/Route Wave, 게이트·면세구역 Demo Flow, 복합 Flight Search |
| Business | 명동·홍대·성수 × 6업종 Opening Brief, Historical Signal, Forecast Performance Demo |
| Harness | Recorder → Outcome → Scoreboard 초기단계와 Backfill/Prospective 분리 |

## 30 DAYS — Live 기반 만들기

| 영역 | 목표 | 완료 조건 |
|---|---|---|
| Product | Demo replacement point를 Worker endpoint로 교체 | Source별 stale/partial/empty UI 통과 |
| Data | 인천공항 Forecast/Flight, 서울 외국인 생활인구, 기상청 P0 Collector | Schema validation·timestamp·recordOrigin 저장 |
| Forecast | 매일 D+1 immutable Forecast Archive 시작 | `forecastIssuedAt → targetDate` 중복/수정 방지 |
| SEO | 독립 도메인·server locale lang·Search Console 준비 | 4 locale URL 검사 PASS |
| Traffic | privacy-respecting event 수집 시작 | 원문 검색어·PII 미수집 확인 |
| Monetization | Pro 관심 클릭만 측정 | 결제 없이 demand signal 확보 |
| Airport | Today/Tomorrow ALL/T1/T2와 T1 출국장·Gate Live 연결 | 임의배분 0건, 취소편 제외, T2 checkpoint N/A, freshness/error state PASS |
| Business | Live signal을 Opening Brief Template에 연결 | Demo badge가 Source 상태에 맞게 교체 |
| Harness | Outcome resolver Skeleton | 실제 Target date 이후만 Outcome 연결 |

## 90 DAYS — 첫 검증과 유입 학습

| 영역 | 목표 | 의사결정 기준 |
|---|---|---|
| Product | 재방문 사용자 핵심 화면 조정 | Opening Brief/What Changed 재방문율 |
| Data | Source gap·지연·drift 관측 | P0 Source 95% 이상 수집성공 또는 대체안 |
| Forecast | 첫 Forecast Accuracy 공개 가능성 검토 | 충분한 고유 Target date, Baseline보다 악화 시 비공개 |
| SEO | 첫 Organic landing 성과 분석 | query intent·CTR·index quality 기반 |
| Traffic | locale/Area/Airport/Business usage 비교 | 단순 pageview보다 반복사용과 task completion |
| Monetization | Affiliate 1개·Pro demand test 검토 | 맥락 적합성, 광고판화 금지 |
| Airport | 항공사/노선/시간·게이트/면세구역 Wave 유용성 검증 | Airport/면세 사용자 반복 조회, 매장 유동·매출 오인 0건 |
| Business | 6업종 Brief 클릭·선호 저장 분석 | 실제 매출 예측 주장 없이 운영가치 평가 |
| Harness | Champion/Baseline Scoreboard | 지난주 같은 요일·4주 평균·계절평균 비교 |

## 6 MONTHS — 충분한 Forward History 활용

| 영역 | 목표 |
|---|---|
| Product | 사용가치가 확인된 Alert·주간 Brief만 선택적으로 추가 |
| Data | 계절성·요일·시간·공휴일·날씨 상호작용 분석 |
| Forecast | 지역별 Calibration, Champion/Challenger Shadow |
| SEO | 공식 History를 활용한 고유 월별 요약 강화, 얇은 자동 페이지 금지 |
| Traffic | Returning cohort와 locale별 organic retention 분석 |
| Monetization | Pro self-service 범위·CSV 수요·Affiliate 품질 결정 |
| Airport | 항공사/터미널/노선 패턴과 지연 정의변경을 반영한 History |
| Business | 업종별 Signal의 설명력·오탐 패턴 분석 |
| Harness | Failure Miner·Candidate Lab·Shadow 활성화, 자동 Promotion은 보류 |

## 12 MONTHS — 1년 Prospective 증거

| 영역 | 목표 |
|---|---|
| Product | 1년 변화와 작년 같은 기간 비교를 사용자에게 단순하게 제공 |
| Data | YoY·Holiday·Regime·Source revision metadata 완성 |
| Forecast | 1년 Prospective Archive로 계절·휴일 효과와 모델 안정성 검증 |
| SEO | 다국어 고유 데이터 Landing의 장기 검색가치 평가 |
| Traffic | Search → task completion → return 관계 분석 |
| Monetization | 검증된 Pro 기능만 정식 가격·결제 검토 |
| Airport | 12개월 T1/T2/Airline/Route 패턴과 실제 Forecast Accuracy 연결 |
| Business | 매장 자체 입력 없이 가능한 범위와 필요한 1st-party data 경계 확정 |
| Harness | 충분한 Shadow 기간·Baseline 우위·Rollback 조건이 있을 때만 Promotion 검토 |

## 제품 확장 Gate

새 지역·새 데이터·새 기능은 아래 7개 기준 중 5개 이상을 만족해야 한다.

1. 반복 사용 빈도를 높이는가?
2. 무료 또는 예측 가능한 저비용 운영이 가능한가?
3. Today/Tomorrow 판단을 개선하는가?
4. 데이터 정의·상업조건·재배포가 명확한가?
5. SEO에서 고유 답을 제공하는가?
6. 전문사용자의 실제 행동으로 연결되는가?
7. Harness가 효과를 검증할 수 있는가?

전국 확대, AI 글 대량생성, Runtime LLM, 검증 없는 매출예측, 임의 T1/T2·국적 추정은 Roadmap에 포함하지 않는다.

## V5.5 IA 이후 측정할 것

- 첫 방문 5초 내 `서울 지역 / 공항 / 매장` 중 하나의 진입점 인지 여부.
- Home → Area, Airport, Business의 Task completion과 필요한 클릭 수.
- Airport `NOW / NEXT / FLIGHTS / HISTORY / AIRLINES`별 사용률과 되돌아가기 비율.
- Business `WHY` 확인 후 Opening Brief·History로 이어지는 비율.
- Global Search에서 `KE703`, 항공사명, `History`, 업종 검색의 무결과율.
- 재방문자의 What Changed·My RetailPulse 사용률.
- 숫자만 본 이탈보다 설명·Data 상세을 펼친 사용자의 재방문 차이.
- 위 신호가 개선되지 않으면 기능을 더 추가하지 않고 IA와 copy를 먼저 재조정한다.
