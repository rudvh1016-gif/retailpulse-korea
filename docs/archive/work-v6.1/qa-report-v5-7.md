# RetailPulse Seoul V5.7 — Credential · Free Use · Customer QA

기준일: 2026-08-23 KST  
범위: 공식 API 비용·키·활용신청·쿼터, Runtime 진실성, 고객 오해, Gate/Duty-free Data Truth, 코드·문서·반응형 회귀

## 1. 냉정한 결론

현재 Work Site는 완성형 Live 제품이 아니다. Editorial UX와 공식 과거분석은 유용하지만 Today/Tomorrow·Flight·Gate·Business 값은 Demo이며, 외부 고객 배포 전에 API 연결·운영승인·접근정책이 남아 있다. 이번 Pass는 이 사실을 숨기지 않고 고객이 오해할 표현을 우선 제거했다.

## 2. 발견한 고객오해 결함

| 문제 | 심각도 | 수정 |
|---|---|---|
| More의 Demo Health에 `Updated 12m ago`, `Weather Updated 35m ago` 등이 보여 Live 연결로 오해 가능 | HIGH | 가짜 freshness 전부 제거. `Official Historical 2 / Live API 0` 연결 준비 상태로 교체 |
| 공항 무료 API를 `키 3개`처럼 읽을 수 있고 Key 수와 활용신청 수가 분리되지 않음 | HIGH | `data.go.kr 프로젝트 서비스키 1개 + API 활용신청 3건`으로 분리 표시 |
| 여객예고를 자동화 API Key가 확인된 것처럼 `KEY_REQUIRED`로 표시 | HIGH | 공식 Web·Excel만 확인된 상태로 `AUTOMATION_REVIEW` 전환 |
| 입국장 현황 API가 문서에는 있으나 Site Data Catalog에는 빠짐 | MEDIUM | Catalog에 T1/T2, H-2~H+2, 500회/일, 운영심의 조건 추가 |
| 무료와 무제한·무장애를 혼동할 여지 | MEDIUM | 무료 개발한도, 운영심의, timeout/rate limit/schema 위험을 Site와 Handoff에 분리 |
| SPA 언어·화면 전환 뒤 브라우저 Title/Canonical이 이전 화면에 남음 | MEDIUM | Title·Description·Canonical·Hreflang·OG/Twitter 설명을 현재 URL과 동기화 |

## 3. 공식 API 감사 결과

| API | 비용 | 개발한도 | 운영 | 이용허락 | 판정 |
|---|---|---:|---|---|---|
| 항공기 운항 상세 | 무료 | 500회/일 | 심의, 활용사례 등록 후 증설 | 제한 없음 | `KEY_REQUIRED` |
| 출국장 혼잡도 | 무료 | 1,000회/일 | 심의 후 증설 | 제한 없음 | `KEY_REQUIRED`, T1만 |
| 입국장 현황 | 무료 | 500회/일 | 심의 후 증설 | 제한 없음 | `KEY_REQUIRED`, T1/T2 |
| 기상청 단기예보 | 무료 | 10,000회/일 | 자동승인 안내 | 제1유형 출처표시 | 같은 data.go.kr 키·별도 신청 |
| 인천공항 여객예고 | 공개 Web·Excel | 해당 없음 | 자동화 계약 미확인 | 확인 필요 | `AUTOMATION_REVIEW` |

`무료`는 API 이용료가 없다는 뜻이다. 호출량·운영심의·인프라 비용·장애 가능성까지 없다는 뜻은 아니다.

## 4. 현재 코드 감사

- Frontend 공공데이터 `fetch`/SDK: 0개.
- Runtime LLM endpoint: 0개.
- 공개 코드의 API Secret/token/password: 0개.
- Worker 외부 데이터 호출: 0개. `ASSETS.fetch`와 `IMAGES`는 Site 자체 정적 자산 처리다.
- 공식 Historical: Airport monthly/annual, Seoul foreign living population monthly.
- Demo: Area pulse, Airport today/tomorrow, Flight/Gate wave, Business, Forecast performance.
- Count 숫자 `K/M/B`: 금지 유지.

## 5. 고객 Journey 재검토

### Home

- 첫 화면에서 오늘/내일, 지역, 공항 진입점은 명확하다.
- Demo 배지는 보이나 Live가 아닌 사실을 More에서 더 강하게 확인하도록 수정했다.
- Editorial hierarchy와 이미지·데이터 균형은 유지했다.

### Airport

- 전체/T1/T2, NOW/NEXT/FLIGHTS/HISTORY/AIRLINES 구조는 찾기 쉽다.
- T1/T2 Live 값이 없을 때 전체값을 복제하지 않는다.
- Gate/Duty-free Wave는 `DEMO`이며 매장 방문객·매출이 아니라고 명시한다.
- T2 출국장 1분 대기값은 공식 미제공이라 N/A를 유지한다.

### More

- 이전에는 가장 위험한 오해가 있던 화면이었다.
- 현재는 `키 1 / 활용신청 3 / 무료 개발한도 / 운영심의`를 한 화면에서 구분한다.
- 18개 Source Catalog는 Summary 후 펼치는 구조라 정보가 많아도 첫 화면을 덮지 않는다.

## 6. Gate · Duty-free 판정

- 공식으로 가능한 것: T1 출국장 대기, 항공편별 터미널·게이트·체크인·상태, 공식 면세시설 위치.
- 계산 가능한 것: 취소편 제외 Gate-zone 출발편 집중, 지연편 수, 시설 인접 구역 흐름 신호.
- 공개데이터로 불가능한 것: 특정 신라면세점 매장 방문객, 매출, 전환율, 정확한 Store crowd.
- 따라서 `가장 바쁜 면세점`이 아니라 `가장 많은 출발편이 예정된 게이트 인접 구역`으로만 표시한다.

## 7. 자동검사

| 검사 | 결과 |
|---|---|
| ESLint | `PASS` |
| Production build | `PASS` |
| Rendered HTML / regression tests | `PASS` · 12/12 |
| Runtime data API 0 / Secret 0 정적감사 | `PASS` |
| K/M/B Count pattern | `PASS` · 기간 Selector의 6M/12M을 제외한 Count 축약 0건 |
| App-origin browser console | `PASS` · Site 오류 0건 |
| Browser extension 자체 metadata error | Site 결함 아님, 판정 제외 |

## 8. BLOCKED / 남은 위험

- `BLOCKED_BY_CREDENTIAL`: data.go.kr 프로젝트키와 API별 활용신청.
- `AUTOMATION_REVIEW`: 인천공항 여객예고 자동수집 계약.
- `HANDOFF_REQUIRED`: Collector, normalized store, timeout/retry/cache, 운영계정 증설.
- `WORK_PLATFORM_LIMIT`: 외부 일반 고객의 접근범위는 현재 Work Site access 정책을 별도 확정해야 함.
- `NOT_AVAILABLE`: 면세점별 실제 방문객·매출 공개 API.
- `NOT_READY`: Prospective Forecast archive 기반 Accuracy.

## 9. Release Gate

Live 표시 전 실제 응답, Schema, Timestamp, 0건, quota, timeout, stale cache, T1/T2 partial failure를 Contract Test로 통과해야 한다. 무료라고 장애가 없다고 가정하지 않는다.
