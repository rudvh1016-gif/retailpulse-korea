> Follow-up: [A5/KMA review and critical admission HOLD](D1_FORECAST_RECOVERY_REVIEW_2026-11-17.md) supersedes forecast exclusions and cache/bootstrap activation guidance below.

# D1 용량 복구 2단계: 실제 수집·API 통합과 비활성 전환 명세

이 문서는 같은 draft PR #600의 [1단계 조사](D1_CAPACITY_RECOVERY_2026-11-17.md)를 이어받는다.
**운영은 미복구이며, 실제 SQL·DB 생성·바인딩·권한·결제·머지·배포 변경은 하지 않았다.**
검토 기준 main과 PR base는 `4ade5edf6d7c60637024096ead516b85e159b2c3`였다.
1단계 head `58e9cb2`의 CI run43978934099는 시작 시 IN_PROGRESS였으며, 이후 재확인에서 SUCCESS였다. 2단계의 새 head CI는 별도로 확인한다.

## 이번에 실제로 연결한 최소 경로

```text
기존 직렬화된 realtime cycle / 기존 A4 retry
 → collect-production.ts (RPK_RECOVERY_WRITES=true일 때만)
 → DB별 admission 상태 확인
 → 기존 실제 T1/T2/서울 collector, normalizer, SQL (ACTIVE DB의 canonical staging)
 → SUCCESS + 전체 key/타임스탬프/값/health receipt 검증
 → recovery_public_snapshots의 source당 단일 UPSERT
 → 게시된 payload를 다시 읽어 정확히 일치하는지 확인
 → 현재 summary 및 health가 게시된 snapshot만 사용 (RPK_RECOVERY_READS=true일 때만)
```

- T1은 현재 공식 계약 12개 DG checkpoint, T2는 8개 모두 필요하다. 부분·중복·서로 다른 관측 시각은 승격하지 않는다.
  실제 collector의 응답 row count도 검사해 이전 staging 행이 결손을 가리지 못하게 했다.
- 서울은 4지역의 인구와 소비 모두 VALID이고 40분 이내여야 한다. 실제 source health receipt가 이번 실행 이후인지 확인한다.
  선택적 값 억제로 quality=PARTIAL인 상업 자료는 이전 게시본을 유지한다. 공식 예측 배열은 별도 발행/target/범위 검증 후 사용한다.
- T1/T2 freshness는 기존 20분, 서울은 기존 40분이다. 오래된 snapshot의 원래 시각은 유지하고 공개 STALE로 계산한다.
- partial collection이나 write/validation/publication 실패로 ACTIVE staging 일부가 바뀔 수 있다. **public payload는 바뀌지 않는다.**
  다음 성공에서 전체 canonical 자료와 source receipt를 다시 확인한다. 원본으로 write fallback 하지 않는다.
- 공개 시 source 단위 사본에서 비교·검증을 마친 뒤 응답에 반영한다. 비교 조회가 실패해도 서울 일부 지역만 섞어서 공개하지 않는다.
  잘못된 snapshot/읽기 실패는 DEGRADED, cache-control=no-store로 기록하며 원본 응답을 보존한다.
- 기존 source.status=LIVE가 관측 시각상 오래되면 summary/health의 status를 STALE로 투영한다.
  기존 필드는 유지하고 storedStatus=LIVE를 추가해 저장된 과거 상태와 공개 판단을 구분한다. DB 상태를 수정하지 않는다.
- 기본 비활성이다. 실제 wrangler config에는 새 binding이나 활성화 값이 **없다**.
  기본 경로의 기존 UI/레이아웃은 바꾸지 않았다. 승인된 API 변경만 exact inverse patch로 기존 보호 검사에 추가했다.

## 지원 범위와 복구되지 않는 기능

| 경로 | 이번 최소 경로 | 남은 일 |
|---|---|---|
| T1/T2 현재 대기 | 실제 collector→ACTIVE→원자적 게시→현재 summary/health 연결. busiest hall 재계산 | 별도 facility-operations API는 원본 경로. 그 API를 읽는 화면은 별도 전환 검증 필요 |
| 서울 현재 인구·소비 | 실제 4지역 collector/두 source, 현재 summary/health 연결 | usual API·다른 개별 API는 원본. 모든 서울 화면을 복구했다고 할 수 없음 |
| 서울 공식 예측 배열 | 게시본의 검증된 최신 배열만 현재 summary에 사용 | provider가 공식 예측을 내지 않는 경우 빈 배열을 허용. 미래 targetAt을 최신 수집 증거로 쓰지 않음 |
| 7/28일 비교 | 현재 게시된 관측 시각에 맞춰 원본에서 exact-time baseline을 조회해 다시 계산. 16문장을 1 batch로 처리 | cutover 이후 생긴 ACTIVE 과거 자료를 baseline으로 결합하는 기능은 미지원. 원본에 대응 관측이 없으면 null, 임의 대체 없음 |
| 62일 서울 context·월 비교 | 원본의 기존 읽기/행/시각을 그대로 보존, 현재 overlay도 context를 덮지 않음 | 신규 ACTIVE context는 collector가 보존하지만 공개 current/month context 결합은 미지원 |
| 서울 시간대 차트/달력 | 원본 series + 최신 게시된 관측 1점, 오늘 관측일을 달력에 추가 | ACTIVE의 모든 성공 generation 시계열/과거 날짜 picker 결합은 미지원. 연속 이력을 복구했다고 할 수 없음 |
| A5 예상 승객·불변 발표본 | 새 routing allowlist에서 제외. 원본 보존, 기존 실제 collector/trigger/coverage/recovery 테스트 회귀 | ACTIVE canonical+immutable archive trigger 및 기간/달력/실적 reader 전환은 미지원. 현재 장애를 고치지 않음 |
| KMA 기상 | 새 routing allowlist에서 제외. 원본 보존, 기존 grid/issuance/last-good 실제 collector 회귀 테스트 | ACTIVE 기상 저장·공개 overlay 미지원. 현재 장애를 고치지 않음 |
| 자체 인구 예측/실적 | recovery 모드의 realtime 후처리 predictor/prune를 실행하지 않음. 원본 immutable 입력/예측/실적 유지 | 신규 ACTIVE 관측을 활용한 predictor/outcome/coverage/평가 결합 미지원. 예측 생성 복구 아님 |
| A1/A2/A3/기타 writer | 기존 경로와 스케줄을 변경하지 않음 | 이 경로의 DB별 차단·활성 저장소 전환은 별도 필요. 원본 전체가 시스템 차원에서 read-only가 됐다는 주장은 금지 |

따라서 이 PR은 **현재 summary/health의 T1/T2·서울 최소 경로를 검토할 수 있는 상태**이지,
전 서비스의 무삭제 split-storage 전환이 완성된 상태가 아니다. 미지원 기능을 요구하는 전면 전환은 HOLD다.
서울 장애 시간의 누락 자료는 공식 실시간 feed로 복원되지 않는다.

## DB별 재시도 차단과 기존 알림 연결

- `scripts/recovery-state.ts`가 versioned JSON의 DB별 blocked와 source별 notification state를 검증해 읽고 원자적으로 저장한다.
- 실제 REST collector 오류에서 **7500+Exceeded maximum DB size**를 확인하면 해당 writer DB만 blocked로 남긴다.
  다음 프로세스에서도 그 DB의 provider 요청과 bookkeeping writes를 시작하지 않는다. 다른 DB 키는 계속 허용한다.
  일반 7500 UNIQUE 오류는 용량으로 분류하지 않는다. 기존 transient-only fresh-runner 결정도 유지한다.
- 별도 용량 SQL 없이 기존 REST query meta의 size_after와 실제 관측 시각을 읽어 기존 70/85/95 함수를 재사용한다.
  공식 bytes와 행 수를 분리하고, 저장된 이전 공식 관측과의 차이로 계산한 증가율은 INTERNAL_ESTIMATE다.
  짧은 두 관측의 차이는 장기 일별 추세의 증명이 아니다. meta가 없거나 이번 실행의 관측이 아니면 새 크기로 보고하지 않는다.
  같은 DB의 같은 경고 수준 알림은 억제한다. 이 최소 경로의 임계값 연결은 경고/검토이며 optional writer 전체 제어는 미지원이다.
- 기존 `production-collector-realtime` concurrency lock이 primary+retry의 restore/collect/save 전체를 직렬화한다.
  기존 workflow 두 파일에 opt-in `actions/cache/restore@v4`/`save@v4`를 연결했다. 새 scheduler/외부 메시지/Actions permission은 없다.
- cache namespace는 `rpk-recovery-v1-<active DB id>-<state epoch>-`이고 run/attempt별 immutable cache를 저장한다.
  repo/branch cache scope는 GitHub의 기존 제약을 따른다. cache miss/corrupt는 정상으로 간주하지 않는다.
  bootstrap이 false일 때 cache miss는 provider 요청 전에 해당 recovery job을 막는다. 별개 workflow는 막지 않는다.
- 최초 준비에만 별도 검토된 bootstrap=true를 한 번 사용한다. cache 저장 성공 확인 뒤 반드시 false로 되돌린다.
  bootstrap=true를 계속 두면 cache eviction 뒤 block 상태를 잃을 수 있으므로 전환 게이트에서 거부해야 한다.
- 상태 전이는 기존 Actions annotation으로만 보고한다. 같은 source/DB/state는 반복 알림을 억제하고
  CAPACITY_EXHAUSTED·부분 실패·성공·재발 전이는 다시 알린다. 이는 수집 성공이지 전 서비스 RECOVERED 선언이 아니다.
- 실제 GitHub cache restore/save는 이번에 활성화/실행하지 않았다. 로컬 상태 round-trip과 workflow 계약을 검증했다.
  cache 권한/용량/eviction·동시성의 실운영 확인은 별도 전환 전 게이트다. state 저장/알림 경로 실패는 UNKNOWN/HOLD다.

## 실제 전환에 필요한 최소 변경 — 이번에는 실행하지 않음

1. 기존 승인된 read-only 진단으로 현재 DB bytes·account DB count/합계와 Free 여유를 확보한다.
   추가 지시의 기본 브랜치 scope=storage/ceiling35000 실행은 기존 인증이 없어 하지 못했다.
   새 credential이나 PR 코드에 production secret을 연결하지 않았다. 정확한 현재 공간/추세는 여전히 UNKNOWN이다.
2. 별도 승인된 production 전용 ACTIVE DB를 선택한다. 기존 token의 실제 D1 resource scope로 접근되는지 확인한다.
   새 token/permission이 필요하면 자동으로 바꾸지 않는다. Free의 계정 rows-read/write 한도는 DB를 늘려도 증가하지 않는다.
3. **ACTIVE에만** 기본 schema/migrations와 `config/recovery/schema.sql`을 적용한다.
   이 SQL은 drizzle 자동 migration 경로 밖에 있다. 원본 DDL/migration/export/restore/prune는 하지 않는다.
4. Worker의 기존 `DB`는 원본 그대로 둔다. `RECOVERY_DB`만 ACTIVE에 추가할 변경안을 별도 검토한다.
   Worker vars: RPK_RECOVERY_READS=true, RPK_RECOVERY_DATABASE_ID=<ACTIVE>,
   RPK_RECOVERY_ARCHIVE_DATABASE_ID=<원본>을 일치시킨다.
   validate-cloudflare-environment 게이트는 alias·누락·불일치를 거부한다. staging/다른 서비스 DB 재사용 금지.
   Actions 원본 resolver도 배열 첫 항목 대신 binding='DB'를 선택하도록 수정했다.
5. 기존 Actions repository vars에 RPK_RECOVERY_DATABASE_ID=<동일 ACTIVE>, RPK_RECOVERY_STATE_EPOCH=<검토된 새 epoch>,
   RPK_RECOVERY_WRITES=true를 설정할 명세를 준비한다. 최초 한 번만 RPK_RECOVERY_BOOTSTRAP=true,
   성공한 state cache 저장 후 false로 전환한다. 기존 secret 이름/permissions/scheduler는 그대로다.
6. 한 source씩 순차 정상 수집 2회: 실제 provider count, collector SUCCESS, 전체 key/값/시각,
   게시 payload read-back 일치, cache round-trip을 확인한다. 부분·corrupt·capacity에서 마지막 게시본 유지도 재검증한다.
7. 현재 public summary의 recovery.applied에 해당 source가 있고 recovery.failed가 비어 있어야 한다.
   T1/T2 checkpoint와 4지역 인구·소비의 실제 observedAt/retrievedAt를 게시본 및 health와 대조한다.
   generatedAt, health200, ACTIVE_SNAPSHOTS 문자열만으로 PASS하지 않는다.
8. 실제 Free Worker CPU/latency와 추가 D1 row/read cost를 측정한다. 기본 summary 한 batch는 유지되며,
   opt-in 경로는 snapshot별 소수 read + 서울 baseline 16문장의 한 batch를 추가한다. 수치 미측정이면 성능/무료 안전 PASS 금지.
9. 미지원 기능과 원본에 남은 writer/maintenance를 목록대로 처리한다. 현재 최소 경로 외 source의 쓰기/읽기를
   동시에 전환하는 전면 배포는 이 검증으로 승인하지 않는다. 원본 전체 read-only 보장은 아직 구현하지 않았다.

## 롤백 및 중단 조건

- 즉시 읽기 롤백: RPK_RECOVERY_READS=false → 원본 기존 summary/health 경로. cache는 recovery 모드에서 no-store여서 혼용하지 않는다.
- 쓰기 롤백: RPK_RECOVERY_DATABASE_ID는 유지하고 RPK_RECOVERY_WRITES=false로 전환한다.
  세 대상 source는 SKIPPED_RECOVERY_PAUSED/providerRequests=0으로 멈추며 원본 canonical/bookkeeping/predictor/prune 쓰기는 하지 않는다.
  ACTIVE 설정까지 지우면 기존 원본 경로가 되므로 full 원본에 수집을 재개하기 전 설정을 지우지 않는다.
  다른 source/DB의 기존 수집은 그대로이며 broad workflow kill switch를 쓰지 않는다.
- 원본/ACTIVE/게시 snapshot/immutable archive를 모두 유지한다. 삭제·내보내기·Time Travel·원본 SQL 롤백은 없다.
- 읽기 롤백은 오래된 원본을 정직하게 제공하는 가용성 복귀다. 정상 수집 복구가 아니다.
- DB alias/미확인 여유/누락 cache/상태 저장 실패/불완전 snapshot/공개 timestamp 불일치/실측 quota 초과는 HOLD.
- gate/canonical 계약(T1 12/T2 8)이 실제 공식 계약과 달라지면 마지막 정상 자료를 유지하고 검토한다. parser를 완화하지 않는다.

## 검증 범위

신규 통합 테스트는 실제 production collector/normalizer/SQL과 실제 summarizeLiveSummary를 사용한다.
원본도 실제 collector로 생성한 정상 자료를 갖고, query_only=ON으로 잠근다. ACTIVE는 별도 SQLite DB이며 모든 현재 migration을 적용한다.
테스트는 provider HTTP만 대체하며 실제 외부 API/운영 D1/Cloudflare Worker 배포/실제 Actions cache 통합은 호출하지 않는다.

- T1/T2/서울 성공, 부분 HTTP payload, publish trigger 실패, corrupt snapshot, 원본 row 불변, 마지막 게시본 유지.
- 7/28일 정확 시각 baseline 결과, 4지역×62일 context 248행 보존, 상태 LIVE→STALE와 storedStatus.
- routing 비활성으로 원본 정상 자료 복귀, 같은 DB 차단의 다음 프로세스 유지, 다른 DB 독립,
  missing/corrupt admission fail-closed, 알림 중복 억제·회복·재발.
- 실제 REST 7500 용량 오류에서 wrapper admission latch, 미지원 A5/기상/나머지 source routing 제외.
- 배포 validator의 원본/staging alias, binding 누락, active/archive ID 불일치 거부.
- 기존 A5 partial/immutable archive 및 weather issuance/grid/last-good 테스트를 회귀 실행한다.

최종 실행 수치와 원격 CI 상태는 아래 검증 기록과 PR 본문에 남긴다. 운영 복구 성공으로 해석하지 않는다.

### 실제 실행 기록

- `npm run test:unit`: 2,902/2,902 PASS, fail/skip 0.
- 신규 실제 collector/API/entrypoint 통합: `tests/recovery-real-collectors.test.mjs` 11개 (전체 suite에 포함).
- 최종 집중 명령: `node --experimental-sqlite --import tsx --test tests/recovery-real-collectors.test.mjs tests/d1-capacity-recovery.test.mjs tests/operational-phase2.test.mjs`.
- `npm run typecheck`, `npm run secret:scan`, `git diff --check`: PASS.
- `npm run lint`: exit0, 0 errors / 기존 25 warnings. 새 파일 경고 없음.
- `npm run build`: PASS. `node --test tests/rendered-html.test.mjs`: 54/54 PASS.
- `node --import tsx scripts/health.ts`: HARNESS EXECUTION PASS / SYSTEM VERDICT UNKNOWN / PERSISTENT MEMORY UNKNOWN_NO_DATABASE.
- 초기 실패: 서울 fixture의 필수 CMRCL_RSB 누락을 수정했고, query_only 원본의 SELECT batch에서 테스트 helper가
  BEGIN IMMEDIATE 쓰기 잠금을 잡던 것을 읽기 transaction으로 맞췄다. API 보호 hash 검사는 요청된 정확 API 변경만
  역패치로 등록하여 통과했다. 기존 UI hash와 scheduler lock은 완화하지 않았다.
- 별도 cloud provider 호출, 실제 D1, Worker CPU, Actions cache, 운영 E2E는 실행하지 않았다.
  전체 quota/전 서비스 복구/무료 여유가 PASS라는 주장은 하지 않는다.

원격 head와 새 CI 링크/최종 상태는 draft PR #600 본문이 최신 인계 기준이다. 머지·배포는 하지 않는다.
