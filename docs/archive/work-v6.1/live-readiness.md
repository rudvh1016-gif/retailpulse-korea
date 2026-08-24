# RetailPulse Seoul — Live Readiness

## V6.1 readiness snapshot — 2026-08-24

| Component | Status | Required next action |
|---|---|---|
| Editorial UI, four locales, T1/T2, history and custom periods | `READY` | preserve regression tests |
| Forecast Lab / Track Record honest zero-state | `READY` | connect only immutable production records |
| Airport/Seoul/KMA collectors | `NEEDS_KEY` / `NEEDS_APPROVAL` | obtain verified-free applications; server secrets only |
| Normalizer, storage, scheduler and degraded mode | `NEEDS_CLAUDE_CODE` | implement P0 architecture |
| Prospective prediction archive | `NEEDS_CLAUDE_CODE` | start before any accuracy claim |
| FAST/DEEP outcome archive and scoring | `NEEDS_CLAUDE_CODE` | enforce target match and publication time |
| Shopping-purpose movement | `RESEARCH_ONLY` | reconfirm licence, mapping and commercial reuse |
| Store outcomes | `BLOCKED` | require voluntary aggregate partner data |
| Public `.com`, server SEO, Search Console | `NEEDS_CLAUDE_CODE` | deploy and verify signed-out/public access |

Current public score remains unavailable. Official historical data is real, but it is not prospective prediction evidence.

기준일: 2026-08-23 KST
요약: **제품 UI와 공식 Historical Intelligence는 준비됐지만, Today/Tomorrow·Flight·실시간 Area Pulse는 아직 Live가 아니다.**

## 준비 상태

| 영역 | 상태 | 실제 상태 |
|---|---|---|
| 브랜드·3지역·4언어·2개 이미지 | `READY` | KO/EN/ZH/JA Site에 적용·검증 |
| Editorial Design·Pretendard/Noto | `READY` | AI-card detox, 390px Preview 검증 |
| SEO locale route·metadata·robots·sitemap·404 | `READY_ON_WORK` | 독립 도메인·Search Console·server html lang는 Handoff |
| Opening Brief·What Changed·My RetailPulse | `READY_DEMO` | deterministic Demo·LocalStorage fallback 구현 |
| Global Search·Why This Number | `READY_DEMO` | Area/Flight/Airline/Business 검색, 근거 펼침 구현 |
| Airport 전체/T1/T2 UX | `READY` | History/Flight/항공사 Filter 연동 |
| 공항 공식 월별 History | `READY` | 2025.08–2026.07 실제값 내장, 장기 Backfill 구조 정의 |
| 외국인 생활인구 History | `READY` | 2025.01–2026.07 실제 집계 내장 |
| Data Truth·Record Origin | `READY` | OFFICIAL/DEMO/FORECAST/BACKFILL 구분 |
| 언어별 숫자 Formatter | `READY` | Count K/M/B 미사용 |
| 공항 여객예고 Today/Tomorrow | `AUTOMATION_REVIEW` | 공식 Web·Excel은 확인, 자동화 API·수집 허락 계약은 미확인 |
| 운항 상세·게이트·체크인·상태 | `BLOCKED_BY_CREDENTIAL` | 공식 Live API Key·Schema validation 필요 |
| T1 출국장 1~6번 대기인원 | `BLOCKED_BY_CREDENTIAL` | 공식 1분 API Key·Collector 필요, T2는 공식 미제공 |
| 게이트·면세구역 흐름 Signal | `READY_DEMO / HANDOFF_REQUIRED` | Demo 출발편 집중+공식 시설 위치 UX 구현, Live 계산은 Key 필요 |
| 면세점별 실제 혼잡·방문객·매출 | `NOT_AVAILABLE` | 무료 공개 Source 확인 안 됨, 운영사 1st-party 데이터 필요 |
| 서울 실시간 Area Pulse | `BLOCKED_BY_CREDENTIAL` | 서울 열린데이터 Key·Snapshot 저장 필요 |
| 기상청 단기예보 | `BLOCKED_BY_CREDENTIAL` | 공공데이터포털 Key·발표시점 Archive 필요 |
| 관광공사·TourAPI | `BLOCKED_BY_CREDENTIAL / CONDITION_REVIEW` | 상품별 API·Quota·재배포 조건 확인 필요 |
| Naver DataLab | `OPTIONAL / KEY_REQUIRED` | V1 핵심 의존성 아님, 검증용 Candidate만 |
| KT/SKT 별도조건 데이터 | `OPTIONAL / CONDITION_REVIEW` | 무료 Runtime으로 가정하지 않음 |
| Forecast Accuracy | `NOT_READY` | Prospective `FORECAST_CAPTURED → OUTCOME` 축적 전 |
| Evolution Promotion | `NOT_READY` | 충분한 미래 Shadow 증거 전 자동승격 금지 |

## Live 전환 P0

1. 공공데이터포털 프로젝트 서비스키 1개를 만들고 입국장·운항 상세·출국장 혼잡 API 활용신청 3건 완료
2. 여객예고는 인천공항 ODP API 또는 공식 Excel 자동수집 허락을 확인한 뒤 연결
3. 공식 응답 샘플을 저장하지 않고 Contract test Fixture만 비식별·최소화해 작성
4. `collect_airport_forecast.py`, `collect_airport_flights.py`, `collect_airport_departure_checkpoints.py` 구현
5. 전체/T1/T2·출국/입국·예상/실제·시간 Bucket을 원문 정의대로 정규화
6. `forecastIssuedAt`, `targetDate`, `sourceUpdatedAt`, `retrievedAt`을 함께 저장
7. 일별 공식 실적 Backfill로 7D/30D 화면 교체
8. 매일 Forecast Snapshot을 수정불가 Archive로 보존하고 다음날 Actual과 연결
9. 서울 단기체류 외국인 2026.08 이후 250m Grid와 기존 행정동 Series의 경계·연속성 검증
10. 기상청은 당시 예보와 사후 관측을 별도 Table로 저장
11. Worker API에 stale-last-good, 부분응답, freshness, schema version 추가
12. 공식 면세시설 Directory를 조건에 맞게 Snapshot하고 gate vicinity map을 versioning
13. 취소편 제외·변경시간 반영·T2 checkpoint N/A를 강제한 `compute_gate_retail_flow.py` 구현

## Secret 목록과 발급처

| 값 | 발급처 | 목적 | 무료 여부 | 공개코드 |
|---|---|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 | 입국장·운항·T1 출국장 혼잡. 기상청/KASI도 같은 프로젝트키에 별도 권한 연결 | 무료 한도, API별 활용신청 | 금지 |
| Seoul Open Data Key | 서울 열린데이터광장 | 실시간 도시·최근 생활인구 | 무료 한도 | 금지 |
| 인천공항 여객예고 자동화 권한 | 인천공항 ODP/담당부서 | 공식 API 또는 Excel 자동수집 | 조건 확인 전 미연결 | 금지 |
| TourAPI Service Key | 한국관광공사/API Portal | 행사·관광지·다국어 | 무료 한도 | 금지 |
| Naver Client ID/Secret | Naver Developers | 상대 검색·쇼핑 클릭 후보 | 무료 한도 | 금지 |
| ECOS Key | 한국은행 ECOS | 환율 보조신호 | 공식 무료 API | 금지 |
| KASI API 권한 | 공공데이터포털 | 공휴일·특일, 같은 프로젝트키에 별도 활용신청 | 무료 한도 | 금지 |

Secret은 GitHub Secrets 또는 Cloudflare Secrets에만 넣고 Frontend Bundle에는 전달하지 않는다.

공항 최소는 비밀값 1개와 활용신청 3건이며, RetailPulse P0 Core는 서울 키를 더해 확실한 비밀값 2개다. 기상청을 별도 비밀키로 중복 계산하지 않는다. 세부 근거는 [API Key · Free Use Audit](/api-key-audit.md)을 따른다.

## Release Gate

`LIVE` Badge는 다음이 모두 통과한 Source에만 허용한다.

- 실제 Source 연결
- 정상 수신과 필드 Contract 검증
- Source timestamp와 KST 기준일 표시
- Timeout·Retry·Rate limit·부분실패 처리
- 최근 정상값 또는 Feature 제외 Fallback
- 상업 이용·재배포 조건 확인

그 전까지 Work의 Today/Tomorrow·Flight는 `DEMO DATA`, 공식 확정 과거값은 `OFFICIAL HISTORICAL`로 유지한다.

## Claude Code 실행 순서

1. 문서의 P0 Source별 공식 Schema를 Fixture로 고정한다.
2. Airport Script(`backfill_airport_history.py`, `backfill_airport_airlines.py`, `collect_airport_forecast.py`, `collect_airport_flights.py`, `collect_airport_departure_checkpoints.py`, `compute_gate_retail_flow.py`)를 먼저 구현한다.
3. `airport/current`, `airport/forecast/{date}`, `airport/daily/{yyyy-mm}`, `airport/monthly`, `airport/airlines/{yyyy-mm}` API를 만든다.
4. Frontend의 Demo replacement point를 Worker endpoint로 교체하고 `recordOrigin/publishedStatus/freshness` Badge를 유지한다.
5. 320/375/390/430px Playwright screenshot·overflow·중문 wrap 회귀테스트를 CI에 추가한다.
6. Prospective Forecast Archive가 쌓이기 전 Forecast Performance를 실제 성과로 표시하지 않는다.

상세 Source·산식·N/A 규칙: [Gate & Retail Data Audit](/gate-retail-data-audit.md)
# V5.8 acquisition and evidence readiness

- Forecast public accuracy: **BLOCKED — 0 prospective target days / 0 resolved outcomes**
- Demo performance scoreboard: **REMOVED**
- Beta signup storage: **IMPLEMENTED — D1 `beta_signups`**
- Beta email delivery: **HANDOFF_REQUIRED**
- Anonymous public access: **BLOCKED — current Sites access is custom owner-only**
- Organic search acquisition: **BLOCKED until anonymous access is approved and reverified**
