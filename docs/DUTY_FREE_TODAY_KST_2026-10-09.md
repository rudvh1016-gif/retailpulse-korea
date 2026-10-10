# 오늘 KST 면세환율과 자정 가용성 수정 (2026-10-09)

2026-10-11 실제 누락과 승인된 날짜별 due guard/유한 재확인은 [MIDNIGHT_COLLECTION_RECOVERY_2026-10-11.md](MIDNIGHT_COLLECTION_RECOVERY_2026-10-11.md)를 따른다. 아래 시간당/최대 24회 비용 설명은 이전 정책의 감사 기록이다.

기준 main: `22b7b0c28fdce1712b0c0fcbfa83023c4e1f64ce`. 독립 브랜치 `fix/fx-today-kst-20261009`.
PR317의 UI 잠금 기준 갱신 차단을 존중한다. 그 브랜치/fixture/보호 파일을 변경하지 않았다. 병합·공개 배포·운영 DB 마이그레이션·수동 운영 수집은 실행하지 않았다.

## 확인한 원인과 결과

KST 10월 9일 00:07의 저장 API는 10월 8일 환율 1,343.40원(확인 20:20 KST)을 반환했다.
00:08에 공식 신라 홈을 한 번 읽었을 때 ‘오늘의 환율’은 1,339.20원이었다. 공식 위젯에 익일 적용일/환율은 없었다.
이 숫자는 조사 근거이며 운영 코드에 고정하지 않는다. 기존 수집은 일일 06:07와 배포 후 시작에만 연결돼 있었다.

헤더는 공항 날짜 필터와 별개로 오늘 KST 환율만 표시한다. 어제·내일은 펼친 창의 버튼으로 확인하며 적용일과 원래 확인 시각을 보인다.
오늘 성공값은 후속 수집 실패/HTTP 실패/새로고침 때문에 사라지지 않는다. 브라우저 저장 불가 때도 메모리에 유지한다.
어제 값을 오늘로 바꾸거나 오늘 값으로 내일을 만들지 않는다. 내일은 동일 공식 위젯에 날짜가 명시된 경우만 저장/표시하고 자정에 오늘로 승계한다.
신세계 수집은 복원하지 않는다.

날짜별 저장은 `0024_duty_free_exchange_daily.sql`의 vendor/date PK로 실제 확인된 공개 환율 한 행/일만 남긴다. 기존 현재 한 행의 실제 날짜/확인 시각만 이관한다.
없는 역사를 채우지 않는다. 동일 날짜·환율·출처·범위는 canonical 행 0 write이며 수집 시각 갱신은 기존 attempt 행에만 남긴다.
신규 표가 없는 배포 전 API는 현재 표를 읽는 호환 경로를 유지한다. 수집기는 표가 없으면 공식 사이트 요청 0으로 중단한다.
읽기는 활성 신라 현재 1행 + 어제/오늘/내일 최대 3행, 두 indexed query다. 원본 HTML은 운영 DB에 보관하지 않는다.
0023 번호는 별도 미병합 PR317의 서울 집계 마이그레이션이 사용하므로 충돌을 피했다. 실제 운영 적용은 별도 승인 단계다.

## 수집/캐시 한도와 한계

기존 `collect-realtime.yml`의 trigger-only Worker 알람을 재사용한다. 새 cron/비밀/권한을 추가하지 않는다.
기존 일일 workflow에서 환율 job을 옮겨 중복 예약 소유자를 제거했다. 공항/서울 job 실패와 독립이다.
배포 시작 job과 같은 concurrency group 및 기존 DB one-hour lease를 사용한다. 정상/일시 실패 후 공식 HTML 요청은 시간당 최대 1회, 최대 24/일이다.
403/406 등 차단은 기존 24시간 대기 그대로이며 우회하지 않는다. 공식 자동 이용 quota는 미확인이다. 24는 코드 상한이며 공식 허용 quota라는 주장이 아니다.
매 15분에 설치/DB due-check job이 생긴다(최대 96회/일). 실제 Actions 잔여 분량/queue 지연/운영 flag는 미확인이고 무료 충분을 선언하지 않는다.

첫 자정 trigger는 00:07 KST + GitHub queue/install/runtime 시간이다. 원천이 익일 값을 미리 공개하지 않거나 장애가 나면 자정 즉시 값을 보장할 수 없다.
00:00 새 trigger/시간당 provider 제한 축소는 이 PR에 넣지 않았다. 필요하면 별도 정책/예산 승인이 필요하다.
오늘 값 없는 API 캐시는 browser 5s/shared 15s(기존 60s/300s), 오늘 값 있으면 기존 60s/300s. 모두 KST 자정 전에 만료한다.
브라우저의 빠른 저장 API 조회는 자정 첫 15분/마운트된 하루 최대 12회에 한정한다. 조회 실패는 30/90초 두 번 뒤 기존 15분으로 돌아간다. focus는 5분 제한.
각 방문자는 내부 저장 API만 읽으며 공식 사이트를 호출하지 않는다. 새로 마운트/새 방문자가 생기면 각각의 읽기 한도는 다시 생긴다.

## 검증

- native lint: error 0, 기존 img 경고 7.
- native tsc --noEmit, 동일 설치 vinext build: PASS.
- 전체 unit: 1,244 PASS/0 FAIL. 첫 실행의 font subset 1글자 실패를 ‘내일 환율’로 수정한 뒤 전체 재검증했다. 폰트/fixture는 그대로다.
- 관련 unit 93: 환율 19, font 2, storage/index/scheduler/Owner UI Lock 포함 PASS.
- Chromium 환율 E2E 31: ko/en/zh/ja × 360/390/430/1280, 숫자 한 줄/overflow/glyph/콘솔, 키보드/escape/focus/reduced-motion, 자정(요청 진행 중 포함), 날짜 필터, 어제/내일, 저장소 불가, reload/network/storage failure, 12회 제한/회복 PASS.
- 첫 E2E는 브라우저 경로 설정 실패(실제 브라우저 실행 전)였고 기본 native 설치 경로로 복구했다. 이전 증거 테스트의 hydration 이전 click은 실제 수집 상태를 기다리도록 수정했고 31개 전체를 다시 통과했다.
- secret scan: working tree + reachable history PASS.
- 61 protected 파일 전부 hash 동일. phase2-locks.json SHA256 `6cca131bf61bad933a28e6ca8e6b18f99500cf92b2c1fe30504a2ec6f27c1f7d`.
- 상세 build 비교와 local workerd D1 meta는 아래 증거 JSON. 운영 D1/Cloudflare 실제 사용량은 측정하지 않았다.

동일 Node24.17/dependencies/native build의 전체 client gzip JS 465,265→465,963B(+698), CSS 55,716→55,811B(+95).
초기 페이지 다운로드나 모바일 PSI/LCP/CLS 측정이 아니며 속도 점수 향상을 주장하지 않는다. 전후 비교의 기준 빌드는 별도 detached worktree에서 재구성했다.
UI는 기존 font/size/색상/숫자 tabular width/헤더 자리 예약을 유지한다. 새 문구 때문에 추가 폰트 slice를 내려받지 않는다.
기존 frontend-design/web-design-guidelines와 최신 Vercel 공식 규칙을 적용했다. 변경 UI는 버튼/44px touch/focus/overflow/empty state/국제화/정적 동작을 확인했다.

## local D1 및 비용 모델 (운영 측정 아님)

local Miniflare/workerd가 반환한 meta: 최초 수집 read6/write7, due 아님 read3/write0/provider0, 동일 의미 재확인 read11/write2(canonical0), 새 날짜 read10/write5, 저장 API read4/write0/provider0.
비용은 SQLite/D1 index amplification을 포함한다. raw 응답·거래·개인 자료를 이 문서/증거에 넣지 않는다.
활성 vendor 1개/날짜 PK의 증가 상한은 366행/년. HTML 저장 0. 한 행과 PK index를 합쳐 1KiB/일로 가정하면 최대366KiB/년(INTERNAL_ESTIMATE, 실제 운영 allocation 아님).
provider 최대24/일, due-check96/일. 동률 canonical0 측정은 운영 attempt2writes와 구분한다.
정상 하루 단일 값 가정: 23×read11/write2 + 하루교체read10/write5 + 72×read3/write0 ≈ read479/write51/일(시작/익일 동시 공개/장애/운영 observer 별도).

FX 추가 트래픽 모델: cache 없는 GET당 최대 2 SQL/약5 indexed rows 가정(실측 4, 3일 모두 있을 때 상한5).
Best=1/Expected=2/Worst=14 GET/방문(첫15분에 마운트1회 유지하는 시나리오)(12 자정+실패2); 마운트 유지시간/새로고침은 추가된다. 모든 숫자는 FX만, site 전체가 아니다.
| 방문/일 | Worker GET Best/Expected/Worst | D1 rows Expected/Worst (cache 없음) | provider |
|---:|---:|---:|---:|
|100|100/200/1400|1000/7000|≤24/일|
|500|500/1000/7000|5000/35000|≤24/일|
|1000|1000/2000/14000|10000/70000|≤24/일|
|5000|5000/10000/70000|50000/350000|≤24/일|
|10000|10000/20000/140000|100000/700000|≤24/일|
|20000|20000/40000/280000|200000/1400000|≤24/일|

D1 queries는 GET 수×2, canonical read/write는 위 collector와 별도다. 실제 공유 cache/region hit율 미측정. 사이트 전체 Free 충분 여부 BLOCKED.
70% NOTICE: 실제 Worker/D1/Actions/provider 사용량과 stale/queue 확인.
85% PROTECT: 새 활성화/빈번 조회 확대를 중단하고 cache/기존 last-good 증거 유지.
95% EMERGENCY: 자동 확대 없이 기존 보호/차단 정책 적용; 오래된 값을 오늘로 바꾸거나 원천을 우회하지 않는다. 이 PR은 기존 전역 guardrail을 재개발하지 않는다.

## 30-pass 적용 감사

|#|항목|상태/근거|
|---:|---|---|
|1|실제 origin/main|PASS 22b7b0c|
|2|독립 작업/Claude 보존|PASS 별도 worktree|
|3|유료/런타임 LLM|PASS 추가 없음|
|4|활성 source|PASS 신라만|
|5|공식 자동 이용 quota|BLOCKED 미확인|
|6|selector/number contract|PASS unit|
|7|적용일/익일 증거|PASS unit+E2E|
|8|stale/failed truth|PASS|
|9|시간당 요청 한도|PASS 기존 DB guard|
|10|차단/redirect 우회 금지|PASS 기존 24h guard|
|11|경합/expired lease|PASS real SQL|
|12|semantic unchanged writes|PASS 0 canonical|
|13|real local workerd meta|PASS 증거 JSON|
|14|운영 migration|BLOCKED 별도 승인 단계|
|15|indexed bounded read|PASS query plan|
|16|retention class|PASS daily aggregate/원본 0|
|17|자정 cache|PASS|
|18|browser read/retry 상한|PASS|
|19|visitor provider calls|PASS 0|
|20|운영 enable flag|BLOCKED RUNTIME_ENABLE_STATE_UNKNOWN|
|21|예약 중복/5 alarm|PASS scheduler tests|
|22|GitHub 운영 queue/분량|BLOCKED 미측정|
|23|Cloudflare 공식 사용량|BLOCKED 미측정|
|24|last-good 보존|PASS SQL/reload/failure|
|25|UILock/fixture|PASS 61 동일/테스트 유지|
|26|언어/반응형/키보드|PASS E2E31|
|27|lint/type/build/unit|PASS 위 결과|
|28|secret scan|PASS tree+reachable history|
|29|font/performance bundle|PASS subset/동일 build|
|30|production publication/실측|BLOCKED 병합/배포 미실행|

## 독립 후속 조사: 공항/관광 (이 PR에서 변경하지 않음)

KST 00:14의 공개 API 4회만 읽었다.
- 10/9 출발편 API: held official schedule585, T1 108/T2 275/탑승동202, 전체 날짜 00:10–23:55, 운항 상태는 모두 UNKNOWN. 실제 운항 585편이라는 뜻이 아니다.
- 같은 날짜 summary: 출국 예상108,023(T1 59,901/T2 48,122), 24시간 COMPLETE, 마지막 예상 자료23:43(T2 22:43) KST. 실제 운항 기록은 null. 입국 예보360명(00–01)은 별도 값이다.
- summary scheduledBriefing은 PARTIAL_SCHEDULE53편만 사용. `app/api/live/summary/route.ts:695`의 FUTURE 조건과 702의 선택 때문에 TODAY는 이미 저장된 official schedule을 sides에만 쓰고 summary ranking에는 쓰지 않는다. 우리 쪽 연결 문제다.
- 10/10 official schedule568편은 저장됨. passenger forecast는0band/null/UNAVAILABLE. 원천의 ‘미공개’라고 확정할 근거는 없다.
- 보호 파일 summary route 수정이 필요하다. 구체적 방향: TODAY && flightRows.length===0이면 기존 읽어 둔 official schedule을 scheduledBriefing에도 사용, flightRows가 있으면 기존 actual/partial 분리 유지. 새 provider/DB query는 필요 없다. 해당 hash 기준 갱신은 시도하지 않았다.

관광 화면의346.5는 `lib/foreign-purpose-mobility.ts`가 월 ZIP에서 최신 일 CSV의 destination행/purpose5 total_cnt를 합산한 추정 이동 규모다. 월 전체 합계나 고유 관광객/매출 값이라고 볼 수 없다.
서울 [공식 데이터셋](https://data.seoul.go.kr/dataList/OA-22378/F/1/datasetView.do)은 일/시간/목적별 자료를 월별 배포하며,
[공식 설명](https://data.seoul.go.kr/dataVisual/seoul/capitalRegionLivingMigration.do)은 통계적 추정 이동과 실제의 차이를 명시한다.
정확한 total_cnt 단위의 원본 layout/manual은 아직 확인하지 않았으므로 ‘명’을 임의로 붙이지 않는다.
문구 초안은 ‘관광 목적으로 이 지역에 도착한 이동 규모(추정)’ + 실제 자료일. 월간은 배포 주기 표기로 분리해야 한다.
`app/tourism-desk.tsx`와 `app/tourism-visitor-show.tsx`는 보호 파일이다. ‘관광객에게 보여주기’ 별도 행사 블록 제거와 문구 변경은 미구현/보호 절차 차단으로 남긴다. 인접 입국 예보360명은 제거 대상이 아니다.

이전 PR317 fixture 갱신 1회는 자동 승인 검토에서 ‘보호 제어 약화/전달 transcript만으로는 trusted 직접 승인으로 볼 수 없음’으로 거절됐다.
이번 PR에서 같은 기준 갱신 재시도0/우회0/새 승인 질문0이다. 해당 차단과 환율 독립 구현 완료를 구분한다.

## 반영 전 정지 지점

Draft PR와 정확한 원격 SHA/CI 상태는 PR 본문에 기록한다. main 병합·운영0024 적용·배포·운영 수집 검증은 아직 실행하지 않았다.
운영 적용 때는 기존 수집이 신규 migration 전 공식 호출0으로 중단되는 순서를 고려해 migration→collector/app 배포 순서를 검토해야 한다.
기존 deployment pipeline이 이 schema를 자동 적용하는지 이 PR만으로 확정하지 않는다.
공개 approval 없이 여기서 멈춘다. Library native upload helper unavailable이므로 새 Library ID는 없다. PNG 증거는 저장소 경로로 제공한다.
