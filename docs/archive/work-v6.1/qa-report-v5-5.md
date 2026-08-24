# RetailPulse Seoul V5.5 QA Report

기준: 2026-08-23 KST  
대상: V5.5 Information Architecture + Content Depth + UX Clarity Pass

## 1. 실행 결과 요약

| 영역 | 상태 | 결과 |
|---|---|---|
| Build | PASS | bounded vinext production build 성공 |
| Lint | PASS | ESLint 오류 0건 |
| Automated tests | PASS | 기존 7개 테스트 전부 통과, V5.5 회귀검사 추가 예정/실행 |
| Browser runtime | PASS | Home, Airport, Business, Insights 직접 탐색 |
| App console | PASS | `terminal.local` origin error/warning 0건 |
| 8 User Journeys | PASS | 8 / 8 |
| KO / EN / ZH-CN / JA | PASS | 현재 Page 유지, URL·본문·hydration 후 html lang 일치 |
| Desktop overflow | PASS | 1,348px viewport에서 `scrollWidth = clientWidth` 네 언어 모두 확인 |
| Narrow-device visual | BLOCKED | Work Cloud Browser에 viewport 전환 기능이 없어 실제 320/375/390/430 screenshot은 Production CI 필요 |
| Responsive implementation | PASS | 820px/365px breakpoint, wrapping, tab overflow, number overflow guard 구현 |
| Data Truth | PASS | Demo/Official 구분, T1/T2 임의배분 없음, 편수≠승객수 유지 |

## 2. 기능 보존 감사

다음 V5 기능이 소스와 화면에 모두 유지됨을 확인했다.

- 서울 이미지 A/B, Pretendard, Noto Sans JP/SC.
- KO, EN, ZH-CN, JA.
- 명동, 홍대, 성수.
- Airport 전체/T1/T2, Flight Search, Airline Intelligence, Gate/Duty-free flow, Official History.
- Business 6업종, Opening Brief, Business History, Forecast Performance.
- Today Brief, What Changed, My RetailPulse, My Airport, Why This Number, Global Search.
- Data Source, Data Truth, Demo/Official Historical, Production 문서.

기존 Forecast는 삭제하지 않았다. Bottom Navigation 표시명을 Insights로 바꾸고 기존 `/forecast` route와 7일 예측을 유지했다.

## 3. Information Architecture QA

### Home

PASS

- Today Brief가 지역 비교보다 앞에 있어 오늘의 핵심을 먼저 읽는다.
- Today와 Tomorrow 순위를 한 화면에서 비교할 수 있다.
- Airport Now는 전체 공항 Demo와 T1/T2 미연결을 섞지 않는다.
- Next 3 Hours는 Airline과 목적지 Region의 `flight_count`만 표시한다.
- Quick Actions 여섯 개가 Area, Flight, T1/T2, Business, History, My RetailPulse로 연결된다.
- Feature Discovery는 기능 설명과 실제 진입점을 함께 제공한다.

### Area

PASS

- 순서: Summary → Why → History → Good to know → Data.
- 숫자 옆에 추천시간과 한 줄 해석이 있다.
- Why 행은 한 줄 요약 후 상세 문장을 펼칠 수 있다.
- 최근 4주 비교는 현재값·기준값·차이·Insight를 함께 보여준다.
- Good to know는 구체적 행동 문장이나, 확정 표현은 사용하지 않는다.
- Demo와 Official Historical을 Badge뿐 아니라 문장으로 설명한다.

### Airport

PASS

- 상위 문맥: Now / Next / Flights / History / Airlines.
- Terminal Selector는 모든 문맥 위에 고정된다.
- Flight Search는 Global Search의 편명 결과와 직접 연결된다.
- Next는 1H/3H/6H/Today 하나의 시간창으로 출발편·Airline·Route·T1/T2·Delay를 집계한다.
- History는 Direction·Period·Terminal, 월별 Table, 일평균, MoM, T1-vs-T2를 유지한다.
- Airlines는 Watch, Airline count, Route, 공식 월별 Airline 실적을 유지한다.

### Business

PASS

- 순서: Tomorrow → Why → Opening Brief → Action → History → Data.
- Opening Brief가 2~3문장으로 확장되었다.
- 각 Action은 한 줄 결론과 판단 범위를 설명한다.
- 정확한 직원 수·재고 수량·매출 증감을 지시하지 않는다.
- 6개 업종과 3개 지역을 모두 유지한다.

### Insights

PASS

- 기존 7일 예측을 유지한다.
- This Week, Area Compare, What Changed, T1 vs T2, Historical Highlights를 한 문맥으로 묶었다.
- T1/T2 비중은 `airportMonthly` 공식 실적에서 계산하며 하드코딩된 임의 비율이 아니다.
- `/forecast` route를 유지해 기존 내부 링크와 SEO route를 깨뜨리지 않는다.

## 4. User Journey Test — Browser

| # | 질문 | 동작 | 확인 결과 | 상태 |
|---|---|---:|---|---|
| 1 | 오늘 명동 언제 가지? | Home → Today 명동 | Summary Today + 14:00—18:00 | PASS |
| 2 | 내일 홍대는 어때? | Home → Tomorrow 홍대 | Summary Tomorrow + Hongdae + 16:00—21:00 | PASS |
| 3 | T2 오늘 많이 붐비나? | Home T2 → Airport Now | Live N/A 이유 + T2 공식 월별 History 경로 | PASS |
| 4 | KE703 어디서 떠? | Header Search → KE703 | T2, Gate 252, Check-in E, 정상 | PASS |
| 5 | 앞으로 3시간 대한항공 얼마나 떠? | Airport → Next → 3H | KE 편수 + 편수≠승객수 설명 | PASS |
| 6 | 지난 6개월 T1/T2 어떻게 달라졌지? | Airport → History → 6개월 | 공식 월별 + T1 vs T2 최근 3개월 비교 | PASS |
| 7 | 명동 화장품 매장은 내일 뭘 준비하지? | Business → 명동 → 뷰티 | Tomorrow, Why, Opening Brief, Action | PASS |
| 8 | 어제와 오늘 뭐가 달라졌지? | Home → What Changed | 지역·T2·날씨·지연 변화 | PASS |

모든 Journey가 1~3회의 핵심 선택 안에서 답에 도달했다.

## 5. 4개 언어 QA

| Locale | URL 유지 | UI 핵심문구 | html lang (hydration 후) | Overflow | 상태 |
|---|---|---|---|---|---|
| ko | `/ko/forecast` | 인사이트 / 이번 주 | `ko` | 없음 | PASS |
| en | `/en/forecast` | Insights / This Week | `en` | 없음 | PASS |
| zh-CN | `/zh/forecast` | 洞察 / 本周 | `zh-CN` | 없음 | PASS |
| ja-JP | `/ja/forecast` | インサイト / 今週 | `ja` | 없음 | PASS |

Language Switch는 현재 Page를 유지했다. 일본어에서 `/ja/forecast`를 새로고침한 뒤 日本語 navigation과 `lang=ja`가 유지됨을 확인했다.

주의: Server 최초 HTML의 root `lang`은 Work shell 제약상 `ko`로 시작하고 hydration 후 locale로 바뀐다. 이 문제는 기존 SEO Handoff의 `HANDOFF_REQUIRED`이며 독립 Production에서 server locale layout으로 해결한다.

## 6. Bug Attack / 발견한 문제

### 수정 완료

1. **T1/T2 N/A인데 전체 공항 혼잡 문장 노출**  
   원인: Now 하단 설명이 Terminal availability와 무관하게 고정 문장을 사용.  
   수정: `terminal=ALL`일 때만 전체 공항 Demo 문장을 표시하고, T1/T2에서는 Live 미연결 + 공식 월별 History 가능 문장으로 분기.  
   재검증: PASS.

2. **중국어 Opening Brief에 한글 단어 혼입**  
   원인: 확장 copy 작성 중 locale 문자열 오타.  
   수정: 중국어 `多语种说明`으로 교체.  
   재검증: source search PASS.

3. **Airport/Insights/Business 문맥 nav scrollbar 노출**  
   원인: compact horizontal navigation에 브라우저 scrollbar가 시각적으로 나타날 수 있음.  
   수정: keyboard/scroll 가능성을 유지하면서 scrollbar만 숨김.  
   재검증: desktop screenshot PASS.

### 공격 상태 확인

- T1/T2 Live 없음: 숫자 복제 없이 N/A + 설명.
- Flight 0건: 설명형 Empty State 유지.
- History 7D/30D gap: 월별 값을 일별로 변형하지 않고 Historical Gap.
- Demo only: Badge + 문장 설명.
- LocalStorage: try/catch로 차단 시 기본 기능 유지.
- 긴 숫자: `formatCount`와 responsive font/overflow guard 유지.
- API failure: More의 state preview 및 source-isolated fallback 계약 유지.

## 7. Design Review

PASS

- 새 정보량을 작은 Rounded Card grid로 만들지 않았다.
- Warm neutral, cobalt active line, thin divider, 낮은 radius/shadow를 유지했다.
- Home·Area·Airport·Business 모두 editorial row와 open section 중심이다.
- 숫자와 설명의 계층이 명확하며 모든 숫자를 파란색으로 만들지 않았다.
- 두 서울 이미지를 그대로 유지했다.
- Desktop은 Main/Secondary context를 2열로 사용하되 3×4 dashboard card grid를 만들지 않았다.

## 8. Mobile Review

구현 PASS / 실제 좁은 Cloud viewport BLOCKED.

- 820px 이하: Today/Tomorrow ranking 1열, Airport summary 2열, Area summary 1열, Next/History grid 재배치.
- 365px 이하: ranking 시간 열 숨김, 긴 공항 수치 font 축소, 한·중·일 긴 문장 wrap.
- Context navigation은 horizontal scroll + scrollbar-hidden, 버튼은 최소 높이 58px.
- Bottom navigation safe area와 5개 메뉴를 유지한다.
- Work Cloud Browser가 viewport resize를 제공하지 않아 320/375/390/430px 실제 screenshot 비교는 완료 표시하지 않는다.
- Production Release Gate: 실제 iPhone Safari + Android Chrome screenshot 및 Playwright device matrix.

## 9. Code / Runtime QA

- `npm run build`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS.
- Runtime LLM endpoint search: 0건.
- 숫자 `3.5K / 3.5M / 2.1B` 유형: 0건.
- App-origin console error/warning: 0건.
- Cloud Browser extension 자체 metadata error는 Site 코드가 아니므로 제외했다.

## 10. 남은 BLOCKED / Handoff

1. `WORK_PLATFORM_LIMIT`: 실제 narrow-device visual matrix.
2. `HANDOFF_REQUIRED`: locale별 server-rendered root `<html lang>`.
3. `BLOCKED_BY_CREDENTIAL`: 인천공항 Forecast/Flight/T1 checkpoint Live API.
4. `NOT_AVAILABLE`: 공식 공개 범위에 없는 T2 실시간 출국장 대기, 면세점별 실제 방문객·매출.
5. `HANDOFF_REQUIRED`: Live endpoint 연결 후 Home Summary와 What Changed를 Demo에서 actual/forecast contract로 교체.

