# D1 용량 장애 조사와 무삭제 복구 후보 — 2026-11-17 KST

> 아래는 1단계 조사 기록이다. 같은 PR의 실제 collector/API 연결 및 기본 비활성 하네스 구현·최신 게이트는 [2단계 통합 명세](D1_CAPACITY_INTEGRATION_2026-11-17.md)가 우선한다. 운영 미복구·운영 변경 금지는 계속 유효하다.

상태: **운영 미복구 / 로컬 검증 후보 / 적용 금지**. 이 문서는 운영 변경 승인 요청이 아니다.
기준 main `4ade5edf6d7c60637024096ead516b85e159b2c3`, 별도 브랜치 `fix/d1-capacity-recovery-20261117`.
기존 작업 트리는 보존하고 새 worktree에서 작업했다. `.agents` 내 적용 가능한 파일은 없으며 root AGENTS.md,
CLAUDE.md, ENGINEERING_DIRECTION, ZERO_COST_HYBRID_AUDIT, PRODUCTION, RUNBOOK, STORAGE_RETENTION,
FORECAST, OUTCOMES, SECURITY와 관련 코드를 검토했다. vendored `.claude/skills`는 UI 전용이어서 적용하지 않았다.

## 독립 확인한 운영 증거

| 확인 대상 | 결과 | 근거 |
|---|---|---|
| Realtime 07:53 | T1/T2/서울 모두 ERROR, changedRows=0, `D1_HTTP_400_7500_EXCEEDED_MAXIMUM_DB_SIZE` | [run43974178505/job133673775755](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/43974178505/job/133673775755) |
| A5 recovery 07:54 | 동일 오류, changedRows=0 | [run43974343021/job133674336693](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/43974343021/job/133674336693) |
| 더 최근 Realtime 08:08 | T1/T2/서울 동일 오류, changedRows=0; fresh-runner retry는 skipped | [run43976486763](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/43976486763) |
| 기상 08:10 | 동일 오류, changedRows=0 | [run43976907637/job133683118218](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/43976907637/job/133683118218) |
| 최신 배포 워크플로 | success, SHA=main; 2026-11-16 23:35 KST 업로드, Worker version `f15f6200-85ef-403d-b538-8544ee7b2792` | [deploy43886707253/job133366691105](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/43886707253/job/133366691105) |

API를 별도 브라우저 GET으로 직접 확인했다. CLI GET은 403이었으며 우회하지 않았다.
`/api/live/summary` generatedAt=`2026-11-16T23:12:06.647Z` (08:12 KST), readStatus COMPLETE, 30 statements.
`/api/health` checkedAt=`2026-11-16T23:12:18.800Z`, app/database ok. 이것들은 **수집 복구 증거가 아니다**.

- T1 실제 관측: 11/17 04:07:00 KST, 12행 모두 STALE.
- T2 실제 관측: 11/17 04:37:08 KST, 8행 모두 STALE.
- 서울 4지역 인구: 03:10 KST. 소비: 명동/홍대 03:20, 성수 02:40, 이태원 03:00. source_health는 과거 LIVE이지만 공개 인구/소비는 STALE.
- KMA 공개 예보 issuance: 11/16 23:00 KST, 마지막 건강 기록 retrieved 11/17 02:10:59 KST. 미래 targetAt은 최신 issuance 증거가 아니다.
- A5 공개 departure 집계의 terminal별 retrieved: T1 04:40:40 KST, T2 전날 22:17:10 KST. arrival retrieved=03:54:11 KST. A5 health=LIVE/coverage=COMPLETE도 새 수집을 증명하지 않는다. changed-only 행의 retrievedAt과 성공한 최신 수집 receipt를 구별해야 한다.
- API는 배포 SHA/version을 제공하지 않는다. 위 version은 최신 성공 배포 로그 증거이며, Cloudflare 현재 배포 Dashboard/API의 독립 재확인은 **미확인**이다.

## 먼저 시도한 용량·계정 여유 확인

실제 bytes, DB 개수, 계정 잔여 공간은 **UNKNOWN**이다. Cloudflare Dashboard는 로그인 화면,
GitHub 브라우저도 미로그인, `gh` 인증 및 로컬 Cloudflare 환경변수도 없었다. 새 자격증명을 만들지 않았다.
GitHub 커넥터는 Actions 읽기는 제공하지만 workflow_dispatch는 제공하지 않아 승인된 storage 진단을 실행할 수 없었다.
운영 워크플로 재실행/수집 dispatch는 0회이다.

기존 [STORAGE_RETENTION.md](../STORAGE_RETENTION.md)의 155,119,616 bytes / DB 1개는 **9/28 역사적 측정**이다.
당시 4.8–6.2 MB/일 추정이 경고선 도달을 예고했으나 현재값으로 쓰지 않는다.
오류 메시지는 용량 초과의 직접 증거지만 정확한 현재 bytes/계정 여유는 아니다.

[공식 limits](https://developers.cloudflare.com/d1/platform/limits/),
[pricing](https://developers.cloudflare.com/d1/platform/pricing/)를 이번에 다시 읽었다:
Free 500 MB/DB, 10 DB/account, 5 GB/account, read 5M/day, write 100k/day; 여러 DB로 나눠도 계정 read/write 한도는 늘지 않는다.
기존 byte 계획값과 공식 표기의 단위 차이는 보고 시 그대로 밝힌다. 사용자가 Paid로 전환하지 않는 한 유료 자동 전환은 제안하지 않는다.

가장 작은 다음 진단은 Cloudflare 기존 세션/API로 DB detail 1회 + account DB list 1회 GET이다.
이 브랜치는 기존 Measure Production Read Budget의 scope=storage에 `metadata_only=true` 선택을 준비했다.
이 모드는 동일 기존 D1 토큰으로 GET 2회, SQL 0회, provider 0회이며 새 일정/권한이 없다.
main에 아직 없으므로 현재 main의 scope=storage와 혼동하지 않는다. 현재 main 진단은 indexed growth/dry-run도 수행한다.
전체 진단은 기존 수동 workflow에서 ceiling=10000 같은 보수적인 값으로 **1회만** 실행하고 중단 기록을 허용한다.
기존 ceiling은 반환 rows_read 누적 뒤 다음 statement를 막으므로 한 문장 초과 가능성이 있다. 엄밀한 사전 비용 상한으로 해석하지 않는다.
GraphQL 미권한/자료 부재는 UNKNOWN, 단일 metadata 관측으로 추세를 만들지 않는다.

## 읽기·쓰기·복구 의존성 맵

현재 DB 선택은 `db/index.ts`(Worker env.DB), `scripts/production-database.ts`(Actions config 첫 DB) 두 곳이다.
Wrangler에 binding 하나만 바꿔도 Actions 선택과 모든 public read가 자동으로 합쳐지지 않는다.
공통 writes는 `lib/collector.ts`의 writeCollectorStatus/writeSourceHealth → collector_runs/source_health,
`operational-bookkeeping.ts`/`operational-memory.ts`의 사건·시도·일일 usage·실행 ledger다.
이 공통 테이블도 가득 찬 원본으로 계속 쓰면 실제 관측 저장 뒤에도 실행이 실패한다.

| 기능 | 공급/수집·canonical writes | read·파생·복구 의존성 | 전환 단위/보존 |
|---|---|---|---|
| T1/T2 혼잡 | collector.ts collectAirportCongestion/T2 → airport_congestion + 공통 상태/receipt | summary/facility-operations 최신 terminal 관측, operational-congestion-recheck exact public 비교, congestion-retry source별 gate | terminal별 완전한 checkpoint snapshot. 새 쓰기 DB + 상태/receipt 동시 필요. 과거 원본 보존 |
| 서울 실시간 | collectSeoulRealtime → seoul_context(지역별 먼저 저장), seoul_realtime_area/forecast/commercial + 두 source_health | summary/usual/population/context/날짜 목록, 7·28일 baseline, 62일 context와 월 비교, commercial-monthly-store; population-predictions/coverage/outcomes/forecast_maintenance | 지역·인구·소비·forecast/context 사이 부분 저장 가능. 전체 generation manifest 필요. 공통 상태와 predictor까지 new/old 명시 분리 |
| A5 예상 승객 | collectAirportPassengerForecast → airport_passenger_forecast → DB triggers archive_insert/update → airport_forecast_versions | collection-recovery/readRequiredForecastCoverage, summary/dateAvailability/airport-days, airport daily composition/기간·월 비교 | canonical+archive trigger를 **같은 새 DB**에 두고 모든 기존 D/E 원본 유지. 빈 DB binding 교체만으로 62일 비교나 과거 발표본이 복원되지 않음 |
| 기상 | collectWeatherForecasts → weather_forecast + 상태/receipt | planWeatherRecovery: issuance/grid coverage; summary 각 지역 latest issuance + horizon | 4지역/grid의 required issuance coverage 검증. 원본 latest를 새 부분 issuance와 섞어 전체 LIVE로 표시 금지 |
| A1/A2/A3/월통계·환승 | airport-today/collector/airport-monthly-stats/transfer → airport_flights/scheduled/facilities, airport_daily_composition 등 | airport flight map/ranking/side/date/month APIs; A1 rolling quota collector_runs+reservation ledger, 동일 날짜 guard, 별도 recovery gate | 이번 후보로 자동 복구되지 않는다. A1 quota/reservation을 두 DB에 나누면 rolling500을 우회할 수 있어 bridge/동결 필요 |
| 예측/실적 | population-predictions → predictions/prediction_inputs/baseline_predictions/forecast_runs/outcomes, coverage | predictions API의 JOIN, cutoff/sourceVersion, hourly matching, forecast-progress와 성능 지표 | FK/JOIN/immutable trigger 그룹 같은 DB. archive와 active의 explicit bounded reads 후 앱 레벨 결합 필요; 분산 transaction 없음 |
| 나머지 데이터/계정 | sales/store/subway/foreign/events/news/calendar/exchange/사용자·여행기록 등 | 모든 route는 기존 getDb/DB 접근을 전제로 함 | 원본에 읽기만 유지하는 경우 새 쓰기는 복구 안 됨. 다른 서비스의 DB/환경을 임의 재사용하지 않음 |

검색 기준: `lib/storage-inventory.ts`의 전체 테이블 분류·reader window, collector.ts,
scripts/collect-production.ts, production-runner.ts, db/index.ts, collection-recovery.ts,
airport-request-budget.ts, population-predictions.ts, commercial-monthly-store.ts,
app/api/live/summary/route.ts 및 분리 public routes, drizzle/0016·0017·0020.
이 맵은 영향 조사다. 모든 API의 split adapter 구현/완전성 증명은 아직 없다.

원본 쓰기 차단은 binding 이름으로 강제되지 않는다. 기존 writer/import/maintenance/operational workflow도
모두 inventory하고 active로 옮기거나 범위별 동결해야 한다. collect-production의 03시 pruning,
runPopulationPredictions의 seoul_context prune도 이번 보존 조건에서는 archive에 실행하지 않아야 한다.
A5 archive의 immutable no-update/no-delete와 predictions/input/outcome FK를 원본에서 제거하지 않는다.
원본 D1 export는 읽기 중단 위험 때문에 하지 않았다. Time Travel은 원본 상태 변경 복구이며 독립 백업이 아니다.

## 무삭제 무료 대안 비교와 선택 조건

| 대안 | 장점 | 제한/판정 |
|---|---|---|
| 원본 read-only + 작은 active D1 | 원본 전부 유지, 새 수집 가능, roll back read 선택 가능 | 우선 후보. 계정 여유/DB 개수/권한 확인 필요. archive+active의 명시적 두 read, dedup·정렬·집계·limit 재적용, FK/trigger/local atomicity 필요. 원본도 장기 보존 대상이며 백업 대체 아님 |
| 비어 있는 기존 production 전용 D1 활용 | DB 추가 없이 가능할 수 있음 | 실제 inventory 미확인. staging/타 서비스 공유 금지. 기존 내용·용도·권한 검증 전 사용 불가 |
| 기존 compact current/aggregate 구조만 활용 | 새 abstraction 최소화 | 원본 full 상태에서 새 삽입/인덱스/크기 큰 UPDATE도 실패 가능. latest current만으로 사라진 서울 역사 복원 불가. 무삭제 제약 아래 즉시 복구라고 할 수 없음 |
| KV/R2/Actions artifact로 새 canonical 대체 | 구조별 가능성 | KV 쓰기 한도/정합성, R2 활성화·billing, artifact 만료/공개범위와 serving 연결 미검증. 새로운 외부 구조/권한을 도입하지 않는 이번 단계에서 제외 |

예상 추가 요금: **Free 범위와 계정 여유가 확인되면 0**, 미확인 상태에서는 무료 안전 보장 불가.
추가 DB가 기존 daily read/write 한도와 storage account budget을 공유한다. 현재 bytes와 증가율이 없으므로
새 DB 수명, 다음 회전일, 소요시간 수치는 산출하지 않는다. 새 DB도 무한 보존으로 다시 가득 찰 수 있으므로
원본을 지우지 않는 용량 계획(향후 shard 회전/독립 보존 전략)은 다음 검토에 포함해야 한다.

## 이 브랜치 구현 범위

- D1 REST: 오류 **7500 + Exceeded maximum DB size** 조합에서만 process-local write latch.
  일반 7500 UNIQUE/SQL 오류는 용량으로 오인하지 않는다. full DB의 반복 mutation은 네트워크 전 차단,
  SELECT/EXPLAIN은 계속 허용, 다른 adapter/DB는 독립. response 5xx여도 이 영구 오류는 HTTP 재시도 안 함.
  reset API 없음. 재시작은 새 관측 필요. 이것은 cross-run/cross-workflow breaker가 아니다.
- 기존 70/85/95 `observeQuota`를 재사용하는 official-byte trend, event/issuance 기준 cross-public proof,
  두 번 연속 정상 receipt 조건, resource/state별 알림 transition. 새 메시지를 보내거나 새 채널을 만들지 않는다.
- `archive-overlay.ts`는 **아직 production import 없음**. bounded explicit 두 결과의 identity dedup,
  immutable collision 거부, expected coverage/동일 issuance 검증 후 atomic persist callback만 호출하는 후보.
  SQL을 추측해서 DB로 라우팅하지 않는다. 실제 collector에 atomic snapshot promotion을 아직 적용하지 않았다.
- local SQLite 2개로 T1 12, T2 8 checkpoint, 서울/기상 4지역, A5 terminal×direction×24h의 합성 장애 실험.
  읽기 전용 archive hash 불변, incomplete/capacity/manifest 실패 후 마지막 정상 snapshot 유지, rollback 증명.
  이 테스트는 generic snapshot fixture이며 실제 production D1, 실제 provider payload/수집기·전체 API 통합 증명이 아니다.

## 중복 없는 하네스 연결 계획 — 아직 활성화하지 않음

기존 authoritative workflow, concurrency, source별 retry와 operational fingerprint를 재사용한다.
현재 congestion-retry/forecast/weather는 이미 D1 permanent failure를 fresh runner로 재시도하지 않는다.
새 schedule/전역 ENABLE 스위치/외부 알림을 추가하지 않는다.

1. 용량 측정과 신선도를 다른 resource로 기록한다. byte는 file_size/size_after 공식값,
   증가율은 서로 다른 시각의 공식 bytes 차이에서 구한 **추정**. row-growth 비례 byte 추정은 별도 필드.
2. 기존 Actions annotations/step summary/artifact에 database-scoped full 상태와 resource별 fingerprint 저장.
   full DB 내부에만 breaker를 저장하면 장애 중 기록 실패하므로 안 된다. 기존 operational incident table은 보조이다.
3. 매 실행 admission에서 source→실제 writer DB mapping으로 full DB에 대한 중복 provider/write를 막는다.
   다른 DB/공급원 분기는 계속 허용하며 source failure 하나로 전역 수집을 끄지 않는다.
   현재 process latch로는 이후 scheduled run의 provider 호출을 막지 못한다. **durable admission 연결은 미구현**.
4. 동일 resource/state는 알림 억제, 심각도 변경/회복/재발 때만 기존 채널에 transition 보고.
   transition 함수는 준비됐으나 workflow 간 artifact state 인수인계/동시성은 다음 승인 단계 검증 대상.
5. 마지막 정상 generation을 유지하고 부분 staging을 public latest로 승격하지 않는다.
   eventAt/issuedAt, source의 전체 expected-key, required horizon, 실제 저장 receipt를 교차 확인한다.
   changedRows=0도 동일 payload의 성공한 재확인이면 정상일 수 있다. 반대로 changedRows>0만으로 완전 수집은 아니다.
6. source별 순차 2회 정상 수집, DB complete/current receipt, 동일 공개 API key와 event/issuance timestamp 확인 후 회복.
   T1/T2·서울·A5·기상 각각 판정한다. 요약 generatedAt/health200은 판정 입력이 아니다.

## 실제 적용 전 필요한 조치·권한·가역적 전환

아래는 **Dot이 별도 판단할 다음 단계**이며 이번에 실행하지 않았다.

1. 기존 Cloudflare 읽기 세션/기존 승인된 storage 진단으로 size/count/free space와 account usage 확보.
   새 credential 불필요. Account Analytics Read가 없으면 기존 권한 범위에서 UNKNOWN으로 남긴다.
2. free space가 검증된 production 전용 active DB 선택/생성은 별도 승인. 필요 권한: 기존 D1 Edit의 실제 resource scope,
   Worker binding 변경/배포용 기존 권한, Actions의 기존 production secret 범위. 좁은 token이 new DB를 못 쓰면 멈추고 별도 판단.
3. fresh DB에 검증된 migration 전체(특히 A5 archive/no-delete triggers, prediction FK)를 적용하되 원본 migration/DDL은 금지.
   운영 DB export/복제 없이 archive의 read-only 이력을 그대로 참조한다. 새 read/write profile에 고정 ID와 schema version 기록.
4. 모든 writer를 source별 active로 명시 선택, optional maintenance 차단, 공통 receipts/health/usage와 A1 reservation 이관 전략 검증.
   full 원본에 old writer가 남아 있으면 승인 불가. 두 writer 동시 활성화 금지.
5. public readers에 explicit archive+active 결합 구현: 날짜 selector, 7/28 및 월 기간 aggregate, 최신 issuance,
   comparison과 prediction JOIN/inputs/outcome, recovery planners까지 모두 포함. limit은 dedup 뒤 적용.
   archive 조회 실패를 빈 역사로 보지 않고 DEGRADED 처리. 새 DB가 비어 있거나 일부 source만 정상이어도 마지막 정상 snapshot 제공.
6. 별도 synthetic/local 전체 경로 + isolated preview 검증 후 source 하나씩 순차 시험 수집.
   기존 scheduler를 중복 생성하지 않고 해당 source만 일시 조정하는 변경은 별도 승인 필요.
7. 승인된 binding/profile 및 Worker read code를 함께 전환. cache key에 profile generation을 넣거나 기존 캐시 명시 무효화,
   config/worker version/DB IDs의 검토용 기록을 남기고 public timestamp 교차검증.
8. rollback: 해당 writer 중단 → 기존 Worker/read profile 또는 last-good active generation 복귀 → cache 분리.
   **원본 full DB로 쓰기를 재개하지 않는다**. 새 DB와 원본 모두 유지하며 history 삭제/Time Travel 불필요.
   rollback은 오래된 자료를 제공하는 읽기 가용성 복귀이고 완전 수집 복구가 아니다.

전환 자체로 원본 읽기를 중단할 필요는 없도록 설계하지만 실제 latency/Cloudflare 제약 미검증으로 무중단 보장은 못 한다.
짧은 source별 쓰기 정지는 split-brain 방지에 필요하다. 현재 누락된 서울 시각은 실시간 feed에서 재다운로드 불가,
결측으로 유지한다. 새 저장소/코드로 수집을 다시 시작해도 장애 시간의 자료가 복원된다고 표시하지 않는다.

## 검증과 남은 차단점

검증 명령과 실제 결과는 이 문서 마지막에 기록한다. 주요 범위: real REST adapter mock errors,
기존 scheduler/retry/operational/public-evidence suite, generic SQLite snapshot atomic rollback.
실제 Cloudflare 현재 bytes/여유, 새 DB schema/latency, provider→D1→public 실제 통합,
모든 archive+active API 결합, durable cross-run breaker/알림 전달은 **미검증/미구현**이다.

ZERO_COST_HYBRID_AUDIT의 영향 gate: HEAD/worktree 확인; scheduler 중복 없음; code7500 영구 실패 분류와 독립 source 테스트;
changed-only 기존 테스트/immutable archive 충돌 거부; 시각/부분 데이터/rollback 검증; official vs estimate 구분.
CPU/traffic/실제 quota/index byte/모델 baseline 검증과 실운영 전체 E2E는 이 브랜치로 PASS 선언하지 않는다.
운영 삭제·압축·복원·내보내기·DB 생성·binding 전환·secret/권한·결제·merge·deploy·수집 재실행 모두 하지 않았다.

### 이번 로컬 실행 결과

- 집중 회귀: `node --experimental-sqlite --import tsx --test tests/d1-capacity-recovery.test.mjs tests/archive-overlay-drill.test.mjs tests/storage-inventory.test.mjs tests/hybrid.test.ts tests/d1-rest-surface.test.mjs` — 60/60 PASS.
- `npm run test:unit` — 2,891/2,891 PASS, 실패/skip 0.
- `npm run lint` — exit0, 오류0, 기존 경고25. 새 파일 경고 없음.
- `npm run typecheck` — exit0.
- `npm run secret:scan` — PASS.
- `node --import tsx scripts/health.ts` — 실행 PASS, SYSTEM VERDICT UNKNOWN, source census UNMEASURED,
  persistent memory UNKNOWN_NO_DATABASE. 운영 PASS가 아니다. `npm run health`의 tsx CLI는 환경 IPC EPERM으로 실패해 동등한 Node import 명령을 사용했다.
- `npm run build` — PASS; `node --test tests/rendered-html.test.mjs` — 54/54 PASS.
- `git diff --check` — PASS.
- 첫 focused run은 신규 모듈이 없어서 실패(테스트 선작성), 구현 후 기존 storage 검사에서 console.log 문법상 2회가 검출되어 실패했다.
  공통 printReport로 각 모드가 report 1개만 내도록 수정 후 60개 집중 검사와 전체 suite가 통과했다. 미해결 로컬 실패 없음.
- 실제 provider 호출/운영 DB write·query·export, cloud deployment/E2E, 신설 D1 및 cross-DB API 전체 통합 테스트는 수행하지 않았다.
  네트워크 public API read는 위 기록한 소수 GET만 수행했다.

원격 브랜치/초안 PR의 CI 상태는 PR 본문이 최신 기준이다. main merge 시 자동 배포되는 저장소이므로
이 작업은 **draft 유지, merge/배포 금지**이다.
