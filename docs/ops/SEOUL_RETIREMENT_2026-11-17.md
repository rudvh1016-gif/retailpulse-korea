# 서울 제품·수집 제외 — 비파괴 배포와 별도 용량 회수

사용자 지시: 서울 관련 기능을 앞으로 제외하고 반영하되, 무료 유지·공항과 공유 자료 보존. 이 변경은 main `4ade5edf6d7c60637024096ead516b85e159b2c3`에서 분리했으며 혼합 복구 draft #600을 병합하지 않는다. 실제 운영 SQL DELETE/DROP/압축/VACUUM/Time Travel/내보내기·데이터 이동은 승인 범위가 아니다. 새 DB 생성도 보류다.

## 반영 범위

- `lib/product-scope.ts`의 컴파일 정책으로 서울 realtime/commercial/forecast, 외국인 체류·이동, 추정 매출·상권점포, 서울 행사, 자체 인구 예측·coverage·outcome 생성, 월 집계의 실제 진입을 DB/provider 이전에 중단한다. 원본과 과거 불변 예측/실적은 남긴다.
- 일일·실시간 기존 workflow의 소스 선택에서 서울을 제외한다. 서울 전용 주간 일정은 제거하고 작업도 false로 닫는다. 새 workflow/권한/자격증명은 추가하지 않는다. 명시적 수동 서울 선택도 writer 정책으로 우회할 수 없다.
- 누락/census/recovery/health/빠른 재조회에서 retired 서울 원본을 제외한다. 과거 운영 사용량·장애 증거는 삭제하지 않는다.
- 공개 summary GET은 서울 전용 실행 쿼리를 보내지 않는다. Seoul 전용 GET(events/commercial-months/predictions/usual/summary monthly records)은 D1 접근 전에410을 반환한다. weather/subway 및 모든 공항 read는 보존한다. 기존 pure summary helper의 legacy scope는 오프라인 과거 계약 검증용이며 공개 GET/query parameter로 활성화할 수 없다.
- 서울 지역·관광·인구/소비/예측·월 서울 기록 진입은 locale 공항 홈으로 이동한다. sitemap·검색/공유 metadata·메뉴·prefetch에서 제거한다. 공항 근무 브리핑은 유지하고 서울 장소/탭만 제거한다. 예전 서울 저장값은 메모리에서 airport/T1로 정규화하며 원래 저장값은 덮어쓰지 않아 코드 롤백에 사용할 수 있다. 기존 airport/T2·동서편·근무시간은 유지한다.
- 기존 site-smoke와 browser/SSR 검증도 은퇴 계약으로 바꾸되 공항 검증은 유지한다. 과거 서울 파서/수집/모델·보존 계약 테스트는 tests 아래의 허용된 메모리 번들만 정책을 치환해 검증한다. 운영 환경 변수나 코드에 재활성화 test bypass를 만들지 않는다. 실제 disabled 경로는 별도 무I/O 테스트로 확인한다.

유지: 공항 T1/T2 대기, A5 예측, 항공편/미래 일정·월 통계·비교, 세관 뉴스/면세·시설, 공항 기상과 공유 KMA 자료, 지하철·공유 기초 자료, 기존 권리/출처/불변 예측·실적 경계. 기술 식별자·운영 DB/Worker binding은 바꾸지 않는다.

## 물리 용량: 이번 단계 회수 0 bytes

코드로 서울 쓰기와 공개 읽기를 멈춰도 기존 DB 파일은 작아지지 않는다. 따라서 배포 성공과 D1 용량 장애 복구는 별개이며, 공항 수집에7500이 계속 날 수 있다. 정확한 현재 bytes·계정 DB 개수/합계·당일 rows-read·서울별 보관 기간은 UNKNOWN이다. 기존 인증 환경 변수/CLI OAuth 설정은 없었고 Cloudflare Dashboard는 로그인 화면이었다. 새 인증·토큰·권한은 만들지 않았다.

`docs/STORAGE_RETENTION.md`의155,119,616bytes는2026-09-28 역사적 측정이다. 당시4개 고성장 서울 테이블의 배분 추정 약73.9MB(forecast50.8+context15.3+area4.2+commercial3.6), 증가 추정3.22MB/일도 현재 회수 가능량/현재 절감량이 아니다. 인덱스/변경 패턴과 현재 기간을 모르므로 지금 필요한/회수 가능한 바이트는 숫자로 확정하지 않는다. 새 빈 DB를 만들거나 기존 DB를 바인딩해 여유가 생겼다고 보고하지 않는다.

## 데이터 경계: 삭제 명령이 아닌 후보 검토 목록

| 분류 | 테이블 | 이번 단계 |
| --- | --- | --- |
| 서울 전용 관측·파생 후보 | seoul_realtime_area/commercial/forecast, seoul_context, seoul_commercial_months, seoul_estimated_sales, seoul_store_dynamics | writer/read 사용 중단, 저장 자료 보존 |
| 서울 전용 비공개 원본 | seoul_foreign_presence_dong/area, seoul_foreign_purpose_mobility/publications | 보존. 재수집으로 과거 복원 보장 안 됨 |
| 파생 서울 상태 | area_data_coverage | 사용 중단·보존. 전체 테이블 삭제 승인 아님 |
| 이름과 관계없이 유지 | seoul_subway_ridership, seoul_subway_collection_checkpoint | 명시적으로 보존·수집 유지 |
| 공유 테이블 | weather_forecast/actual, foreign_presence, tourism_events, holiday_months, tourapi_category_codes | 전체 테이블 삭제 금지. 출처·area별 공유/비공개 경계 별도 검토 |
| 불변 예측/검증 | predictions, prediction_inputs, forecast_runs, baseline_predictions, model_versions, outcomes, airport_forecast_versions | 서울 관련이어도 보존; immutable trigger 유지 |
| 운영 증거 | source_health, collector_runs, operational_*, forecast_maintenance | 경보 표시 제외와 과거 증거 삭제를 혼동하지 않음 |
| 공항/뉴스/세관/환율 | airport_* 및 해당 canonical/review tables | 변경·삭제 범위 밖 |

## 별도 삭제 단계 전의 재현 가능한 보존·회수 게이트

1. 기존 인증이 열리면 공식 메타데이터 GET2종부터 읽는다: `/accounts/{account}/d1/database/{production-id}`의file_size와 `/accounts/{account}/d1/database?per_page=100`의완결된DB수/합계. 선택 계정·Free plan·공유 DB/binding·측정 시각을 확인한다. size 누락/페이지 미완결은 UNKNOWN. 이 GET은 query/export가 아니다.
2. 후보별 actual oldest/newest를 기존 인덱스 seek로 읽고 source/area/기간·보존 등급을 manifest에 적는다. 전수 COUNT/rowid 범위로 정확한 바이트를 주장하지 않는다. 정확한 테이블/인덱스 크기 접근이 없으면 샘플 기반 추정을 별도 표기한다.
3. 실제 삭제에 앞서 독립 백업을 별도 승인받는다. 현재 export는 금지라 실행하지 않는다. schema·index·trigger·migration SHA와 후보의 key/기간/행 수/내용 해시·관계 manifest를 함께 보존해야 한다. Time Travel은 독립 백업이 아니다. 무료 오프라인 저장 공간과 복구 여유도 실제 확인한다.
4. 오프라인/승인된 격리 환경에 복원해 키·내용 해시·기간·관계·trigger,7/28일 및62일 context·월 비교의 재현을 확인한다. 서울 실시간 피드는 빠진 과거를 되살리지 않는다. 비공개 원본/불변 예측·실적/공유 자료는 이번 삭제 후보에서 제외한다.
5. 정확한 대상·predicate·기간·보존 증거·쓰기 예산·복원 결과를 제시하고 실제 작업 직전에 별도 승인을 받는다. 현재 일반 동의는 이 승인이 아니다. 이 PR에는 실행 DELETE/DROP/압축/복원/내보내기 코드를 넣지 않는다.
6. 별도 승인된 회수 후 같은 DB의 공식file_size 전후 차이를 동시 수집 증가분과 구분해 검증한다. 논리 삭제가 물리 감소라고 가정하지 않는다. VACUUM/재구축 등은 자동 후속이 아니라 또 별도 검토 대상이다.

## 코드 반영·롤백 게이트

전체 unit/type/lint/build/SSR 및 필수 Playwright/기존CI를 통과하고 독립 리뷰 문제를 해결한 뒤 별도 PR을 기존 정상 경로로 병합한다. workflow·branch protection·보안·자격증명은 우회하지 않는다. 새 migration/DB 생성/binding 변경은 없다. 기존 배포 workflow의 migration list/preflight에서 pending0이 예상되며, 예상 밖 pending·권한·보호 환경이 나오면 중단한다. 기존 배포가 새 migrations 없이 코드만 반영했는지 로그로 확인한다.

배포 후 `/api/build` SHA와 서울 old route redirect/410·공항/기상/공유 지하철 public smoke를 제한된 요청으로 확인한다. UI만 사라져도 수집이 계속되지 않는지 다음 기존 실행의 source selection/result도 확인한다. 현재 저장 장애 자체의 복구는 별도로 확인해야 한다.

코드 롤백: 새 커밋의 정확한 revert PR → 정상CI/기존 배포 경로. 저장 데이터·스키마를 그대로 남겼으므로 이전 코드의 읽기는 가능하다. 다만 중단 기간의 새 서울 관측은 생기지 않으며 롤백으로 복원되지 않는다. 데이터 삭제 롤백은 코드 롤백과 다르며 이번에는 수행하지 않는다.

## 로컬 검증 및 보호 경계 확인

2026-11-17: 최신 origin/main은 `4ade5edf6d7c60637024096ead516b85e159b2c3`. unit 2,890/2,890, SSR 53/53, typecheck/build/secret scan 성공. lint 오류0(기존 경고25). 로컬 Chromium은 OS socket 권한으로 assertion 전에 종료되므로 browser PASS로 기록하지 않는다. 기존 CI의 실제 브라우저 성공이 병합 전 필수다.

`seoul_subway_ridership`·`seoul_subway_collection_checkpoint`는 collector의 역별 저장·checkpoint 경로를 유지한다. 테이블명의 서울 접두어로 삭제 후보를 정하지 않는다. `drizzle/0016_operational_context_forecast.sql`의 prediction_inputs UPDATE/DELETE 차단 및 airport_forecast_versions 불변 trigger, `0001_crazy_nekra.sql` predictions 불변 trigger를 그대로 보존한다. weather/forecast는 지역 key가 공유되므로 이번 변경은 SQL 삭제 predicate를 만들지 않는다. 공개 summary의 서울 전용 query group만 비활성화하고 shared weather/subway group은 로컬 SQLite 회귀 검증으로 유지 확인했다.

현재 결과는 서울 화면·수집 제외 코드의 로컬 검증이다. 측정된 운영 DB 여유=UNKNOWN, 회수한 물리 bytes=0, 신규 공항 저장 성공/공개 관측시각 갱신=미검증이다. CI·배포와 후속 공개 smoke 결과는 PR에 별도로 기록한다.
