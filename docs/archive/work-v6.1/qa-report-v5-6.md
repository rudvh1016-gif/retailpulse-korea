# RetailPulse Seoul V5.6 — Detailed Range & Runtime API QA

기준일: 2026-08-23 KST  
범위: Airport/Business 상세 기간 선택, 선택 기간 계산, 모바일 레이아웃, Runtime API 진실성, 회귀 Build

## 결과 요약

| 영역 | 결과 | 확인 내용 |
|---|---|---|
| ESLint | `PASS` | 오류 0건 |
| Production Build | `PASS` | vinext 5개 환경 Build 성공 |
| Automated tests | `PASS` | V5.6 추가검사 포함 |
| Airport 상세 기간 | `PASS AFTER V5.8.1 FIX` | 최초 정적검사는 실제 Apply 오류를 놓쳤으며, 브라우저 재현 후 수정 |
| T1/T2 기간 비교 | `PASS` | 선택 기간 공식 T1/T2 합계·구성비, 직전 동일 개월수 비교 |
| Business 상세 기간 | `PASS AFTER V5.8.1 FIX` | Airport와 같은 입력 계약을 사용하므로 함께 수정·회귀검증 |
| 7D/30D Data Truth | `PASS` | 월별 수치를 일별로 변환하지 않고 Historical Gap 유지 |
| Runtime API 표시 | `PASS` | 직접 연결 0개, 공식 Historical 2개, Demo 구분 |
| Mobile code review | `PASS` | 월 입력·버튼 44px, 1열 배치, 긴 월별 Chart 가로탐색 |
| Live public API | `BLOCKED_BY_CREDENTIAL` | 인천공항·서울·기상청 키와 Production Collector 필요 |

## 상세 기간 공격 테스트

> 정정: V5.6의 소스 문자열 검사는 기간 UI의 존재만 확인했고 실제 선택값 적용을 검증하지 못했다. V5.8.1 브라우저 검사에서 월 입력 화면은 바뀌지만 Apply 후 기존 6개월 상태가 유지되는 결함을 재현했다. 네이티브 월 입력을 명시적 월 선택 목록으로 바꾸고, Submit 시 화면의 실제 값을 `FormData`로 읽어 Airport와 Business 필터에 전달하도록 수정했다.

- 시작월이 종료월보다 뒤: Apply 비활성화와 오류문구.
- 한 달만 선택: 해당 월만 표시하며 다른 월을 포함하지 않고, 비교할 두 달이 없으므로 기간 변화는 `—`로 표시.
- 전체 상세 범위 선택: Airport 2025.08–2026.07, 외국인 생활인구 2025.01–2026.07.
- 12개월 이상 Chart: 고정 12열 Wrap 대신 가로 탐색 가능 구조.
- 선택 기간 이전에 동일 길이 데이터가 부족: T2 변화값을 `—`로 표시하고 이유 설명.
- T1/T2: 전체값 임의배분 없이 공식 월별 터미널 필드만 합산.
- 월 일평균: 각 월의 실제 달력일수를 합산해 계산.
- 7일·30일: Daily Source 미연결 상태에서 월별값으로 위장하지 않음.

## Runtime API 코드 감사

현재 `app/page.tsx`와 데이터 모듈에는 외부 관광·공항·서울 데이터 `fetch` 또는 SDK 호출이 없다.

- `LIVE RUNTIME DATA API`: 0개
- 내장 `OFFICIAL HISTORICAL`: 인천공항, 서울 단기체류 외국인 생활인구 2개 Source
- `DEMO`: 지역 Pulse, 공항 Today/Tomorrow, Flight/Gate Wave, Business, Forecast Performance
- Pretendard/Noto Font 요청: UI asset이며 데이터 API가 아님
- Worker `ASSETS`/`IMAGES`: Site 자체 asset binding이며 공공데이터 API가 아님

## 남은 Production 위험

1. 현재 상세 기간은 Frontend에 내장된 월만 선택할 수 있다. 더 이전 월은 Backfill Collector가 필요하다.
2. 7D/30D 실제값은 일별 공식 Collector가 연결될 때까지 제공하지 않는다.
3. 공항 운항·게이트·출국장 혼잡은 공식 API Key와 Server-side Secret이 필요하다.
4. 매장별 면세점 유동인구·매출은 공개 API로 확인되지 않아 항공편·출국장·시설 인접성만 보조신호로 사용해야 한다.
5. Live 연결 후에도 API 하나의 장애가 전체 Site를 중단시키지 않도록 Source별 Cache와 Stale 상태가 필요하다.

## 판정

V5.6 당시 `PASS` 판정은 과도했다. V5.8.1에서 2026-04~2026-06을 선택해 Airport 합계·91일 일평균·Chart 3개월이 실제로 갱신되는 것을 브라우저에서 확인했다. 외부 공공 API의 실제 Live 연결은 계속 `BLOCKED_BY_CREDENTIAL / PRODUCTION_HANDOFF_REQUIRED`다.
