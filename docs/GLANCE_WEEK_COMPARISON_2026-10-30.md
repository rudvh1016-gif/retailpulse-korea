# 한눈에 전주 같은 요일 비교

기준 main: `7c424aeed90946c8c03379b054a30a9a1e5e2fbd`.
분석 #497·달력 #515와 모바일 한눈에 #512가 포함된 main 위에서 작업했다.

## 표시와 진실 경계

- 예상 인원·출발 예정편에 각각 **① 지난주 같은 요일 단일일 비교**와 **② 기존 수집분 일평균 비교**를 분리한다.
- ①은 선택일에서 정확히 7일 전 날짜, 같은 범위의 숫자다. 증감 단위는 `명`·`편`이며 `명/일`·`편/일`이 아니다. 기준 날짜·범위·이전 값은 바로 아래 작은 회색 글씨다.
- ②의 기존 분모·기간·예보 수집일 근거·원시 계산·소수 항공편 평균은 변경하지 않는다. 인원 평균은 출국+환승 예보가 모두 완전한 날짜만 포함하며 월전체 평균과 구별한다.
- 인원 ①은 기존 선택일 출국 예보+도착일 기준 환승 예보의 단순합계와 동일한 전주 합계다. 공식 중복제거 출국객 총수가 아니다. T1/탑승동 예보는 기존의 T1 공통 범위를 명시한다.
- 항공편 ①은 두 날짜 모두 저장 profile의 `complete=true`, 현행 구역표 버전, 각 건물의 시간대·구역 합계 일치가 필요하다. 선택일 저장 합계가 화면의 현재 총계와 달라도 비교하지 않는다. 당일·미래처럼 하루 완료 증거가 없으면 비교 불가다.
- T1 항공편은 **본관만**, 탑승동은 별도이며 공항 전체에는 건물 미확인 편수도 포함한다. `airport-days`의 T1 본관+탑승동 값을 본관 값으로 재사용하지 않는다.
- 누락·불완전·날짜 불일치·수치 불일치는 비교 불가이며 0으로 대입하지 않는다. 실제 기준 0은 차이만 표시하고 증감률 계산 불가다. 감소는 기존 빨강·△, 증가는 기존 파랑·+를 유지한다.

## 읽기·비용 점검 (내부 추정, 운영 여유 보장 아님)

새 `/api/live/glance-week-reference?date=YYYY-MM-DD`는 세 개의 읽기 전용 인덱스 조회다.

1. 정확한 전주 날짜의 기존 `airport_passenger_forecast` 출국 aggregate 예보: LIMIT 65, 65번째 sentinel은 실패.
2. 정확한 전주 날짜의 `airport_transfer_forecast` 공식 예보: LIMIT 3, 3번째 sentinel은 실패.
3. 선택일·전주 날짜 두 개의 `airport_daily_composition`: LIMIT 3, profile만 JSON 투영하여 큰 월 집계 payload 전송을 피한다.

정상 반환 상한은 64+2+2=68개 원천 행이다. 실제 D1 과금 읽기 행수·CPU는 운영 측정 전이며 반환 행수와 동일하다고 주장하지 않는다. 기존 forecast 복합 인덱스와 transfer 날짜 인덱스, composition 기본키를 사용하는 SQLite EXPLAIN 검사를 추가했다.

선택일당 요청 1개가 추가되며 터미널 변경은 같은 응답으로 계산한다. 성공 응답은 브라우저 120초/공유 300초 캐시, 기존 공통 읽기 훅의 최대 3회 실패 재시도를 사용한다. 외부 provider 요청·수집 활성화·스케줄러·D1 쓰기·스키마·비밀정보·유료 서비스 변경은 없다. ① 읽기 API는 기존 렌더 자료와 같이 robots 허용/noindex로 처리한다.

100/500/1천/5천/1만/2만 명이 매일 한 날짜만 새로 열고 캐시가 전혀 없다는 보수적 내부 가정에서는 추가 요청은 각각 100/500/1천/5천/1만/2만 회, 성공 반환 원천 행 상한은 6,800/34,000/68,000/340,000/680,000/1,360,000행이다. 실제 전체 서비스 쿼터는 기존 트래픽·다른 기능·캐시·재시도·스캔 비용과 합산해야 한다. 이 계산은 Free-tier 안전 판정이 아니다. 기존 70/85/95% 보호 정책은 유지한다.

## 검증과 운영 한계

합성 자료는 테스트에만 있다. 운영 원천값을 만들거나 과거 누락을 복원하지 않는다.
운영 API 직접 읽기는 현재 실행 환경에서 403으로 차단되어 최신 전주 값·실제 profile 존재 여부는 확인하지 못했다. 별도 권한 실행도 환경 초기화 오류로 시작하지 못했으며 금지 경로를 읽거나 변경하지 않았다. 운영 검증 전까지 실제 비교 가능 여부나 서비스 수치가 확인됐다고 주장하지 않는다.

최종 검사·커밋·PR·CI 상태는 해당 PR 본문/댓글에 기록한다. 병합은 별도 검토 전 수행하지 않는다.

### 실행 결과

- TypeScript 통과. 전체 ESLint 오류 0, 기존 경고 23개. 수정 TS/TSX 범위 ESLint 오류 0.
- 전체 단위검사 2,550건 통과. 추가 날짜/완전성/터미널/SQLite 계획 13건 및 4언어 단일일 단위 표시 검사를 포함한다.
- 정식 build 통과, 생성된 서버 HTML 검사 53건 통과. 서버 첫 HTML은 로딩 중에 자료 없음·비교 불가·0을 주장하지 않는다.
- `health` 검사 자체는 실행 성공했으나 운영 DB 접근 없는 환경이므로 SYSTEM VERDICT UNKNOWN/SOURCE CENSUS UNMEASURED이며 운영 건전성 PASS가 아니다. 런타임 LLM 호출 0 검사만 확인됐다.
- 브라우저 4개 새 사례(320/390/1440px, 자료 없음) discovery 성공. 기본 번들이 없고 정상 다운로드도 실패했다. 시스템 Chromium은 로컬 socket EPERM으로 페이지가 열리기 전에 종료했다. 정식 권한 실행도 환경 초기화 오류로 시작하지 못했다. 실제 E2E/픽셀 검증은 **차단**, 통과로 표기하지 않는다.
- 초기 병렬검사의 자원 종료 및 로딩 표시 회귀는 복구했다. 순차 build와 서버 HTML 검사로 로딩 회귀를 재검증했다. 테스트를 삭제하거나 assertion을 약화하지 않았다.
- 비밀정보 검사는 전체 원격 ref 갱신 후 재실행 결과를 최종 PR에 기록한다. 얕은 원본 checkout의 shallow 경계가 로컬 복사에 누락된 문제는 원본의 실제 Git shallow 메타데이터를 보존하여 복구했다. 검사 스크립트·패턴·도달 가능한 ref를 줄이지 않았다.

## 2026-10-31 owner follow-up
The original post-day-only selected-flight gate above is retained for historical days but superseded for a fully witnessed current-day schedule snapshot. See `GLANCE_CURRENT_SCHEDULE_COMPARISON_2026-10-31.md` for its stricter scan/health/population/visible-count requirements and provisional schedule label. The original implementation's data boundary must not be mistaken for an upstream outage.
