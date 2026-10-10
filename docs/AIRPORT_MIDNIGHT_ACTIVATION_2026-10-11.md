# A1 새벽 직접 복구 활성화 범위

2026-10-10 UTC / 2026-10-11 KST. 기존 PR332 갱신이며 PR331 병합 main `22ee4206f00a0ac41bb4e9e7d0d5f6717d0eadf6`를 로컬 통합했다. 준비 코드와 운영 성공을 구분한다.

## 승인과 순서

부모 대화 `01a0fd0d-cf77-70ee-b6c3-0d341a4930ec`에서 전달한 증거:

- 제안 `Sentinel_95257506dcec819197812e44bd03c324`: 정기 항공편 수집이 누락되면 01:15~03:00 KST에 하루 한 번 기존 호출 한도로 복구. 유료 서비스·추가 계정 권한 없음.
- 사용자 `Sentinel_76ce21f29a0c81919196fb75dd0fbb78`: “ㅇㅇ허용해”. 후속 `Sentinel_07b0f4befcb08191a4bef9ce4d1d9798`: “누름”. 실제 원격 클릭 결과는 PR331 병합이며 PR332 병합을 뜻하지 않는다.
- Repository `RPK_CENTRAL_RECOVERY_OWNER_APPROVED=true` 설정 후 실제 값 확인: 2026-10-10T20:17:39Z. 새 token/secret/permission은 만들지 않았다.
- **Runtime 변수는 아직 설정하지 않았다.** 활성화 head의 정상 CI 성공, 사용자 병합과 main 반영 확인 후 `RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED=true`를 마지막에 설정한다. 예전 준비 head만 반영되면 켜지 않는다.
- 에이전트는 merge/deploy/수동 수집/원격 임의 DB 쓰기를 실행하지 않는다. PR331 자동 배포는 읽기 전용으로 추적한다. 실제 자동 실행의 child·요청 수·DB·공개 projection 확인 전 운영 완료라고 표현하지 않는다.

## 코드 허용 경계

승인된 코드에서 `CENTRAL_RECOVERY_EXECUTION_ENABLED`와 `A1_MIDNIGHT_RECOVERY_REVIEWED`를 true로 변경한다. 기존 owner/runtime/date 조건도 모두 만족해야 한다.

A1 capability는 `collect-airport-recovery.yml` / `REDISPATCH_SAME_WORKFLOW` / 기존 `airport_recent` selection에 한정한다. 기존 `DAILY_CEILING_FULLY_ALLOCATED` 정책과 500 공유 예산을 유지한다. generic planner에 새 예산을 주지 않는다.

- `centralRecoveryActivation`은 일반 중앙 실행에 항상 `A1_DIRECT_ONLY_SCOPE`를 반환한다. 다른 source의 기존 자체 수집·복구 cadence는 유지한다.
- `executeControlledRecovery`는 임의 A1 job/adapter를 승인하지 않는다. activation test seam을 받아도 A1은 `BLOCKED_A1_DIRECT_ONLY`이며 admission/provider/verification 0이다.
- 유일한 승인 생산 경로는 `executeAirportMidnightDirect`. 고정 main/repository/caller/workflow/child/commit/run attempt/date tuple, `airport_recent` 단독, rescan=false, max125, operation attempt1을 재검사한다.
- legacy HTTP dispatcher의 정상 진입은 `HTTP_DISPATCH_NOT_AUTHORIZED`에서 종료한다. 기존 contents:read만 사용하며 actions:write·새 token이 없다.
- A1은 일반 shadow 정책 후보로 확장되지 않는다. 고정 missing-slot 작업만 승인되었다. 기존 score/예측/감사 알고리즘은 재개발하지 않는다.

## 유지한 보호와 운영 증거

01:15 포함 / 03:00 제외 KST, 하루 한 번, 원래 00:07 슬롯의 durable identity. 원래 job이 이미 시작했거나 queued/active이면 실행하지 않는다. 현재 날짜가 current이면 provider 0. 실제 concurrency 대기 후 coverage/source/auth/schema/429/공유 budget을 재검사한다.

최대125/run, 기존 보수적 rolling24h+30m 공유500 reservation/settlement. 예산 상향·새 retry ladder가 없다. 불명확 crash/receipt/outcome lock은 시간으로 풀지 않는다. 성공은 해당 A1 child 결과·실측 요청 수·현재 complete DB·공개 projection으로 확인한다. 실제 A1 성공 후 기존 DB-only 일별/월별 공항 preparation만 실행한다.

Actions → D1 → Worker 구조, timed owner, concurrency, D1 schema/retention, 예측/Outcome, 70/85/95 규칙과 paid fallback 부재를 유지한다. 새 source/provider·Worker Cron·table·migration은 없다. 뉴스 수집 승인과 별개다.

로컬 fixture/SQLite는 권한·daily attempt·잠금·125/500·zero-call 거부 경계를 검증한다. 실제 source HTTP·원격 D1 usage/CPU·자동 실행 시각과 child·공개 반영은 자동 실행 전까지 **미확인**이다. 무료 안전·traffic capacity 전체 감사를 완료했다고 주장하지 않는다.

최종 로컬 전체 unit1372/표적134, typecheck/변경 파일 lint/빈 binding Node build/working-tree secret pattern/diff whitespace가 통과했다. skip0이다. 기존 UI Lock 및 승인 fixture를 변경하지 않았다. 정상 Cloudflare build/HTML/E2E는 새 head의 자동 CI로 별도 확인한다.

최신 head/검사/CI는 PR332 본문 및 `outputs/a1-schedule-diagnosis-20261011`에 실제 결과로 기록한다. 예전 `2ad1ff07`의 CI1370/HTML46/E2E1163 성공은 준비 head의 역사적 결과다.
