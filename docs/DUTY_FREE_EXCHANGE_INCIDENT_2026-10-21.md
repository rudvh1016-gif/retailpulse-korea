# KORETAIL 면세환율 — 2026-10-21 수집 누락 조사와 안전장치

기준 main: `6a502845185ca8de33aa9c2b34764d33f335cd40`. 사용자 요청은 현재 누락 복구 및 짧은 간격의 유한 재확인이다. 이 변경만으로 원천 수집이 복구됐다고 보고하지 않는다. 원천 HTML 계약을 실제로 재확인하거나, 기존 guard가 끝난 다음 정상 수집 → D1 오늘 행 → 공개 화면까지 확인하는 일이 남아 있다.

## 확인된 원인

- [10/20 09:53 KST 환율 job](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39350227740/job/118392440002): `SUCCESS`, providerRequests=1, changedRows=0.
- [10/20 11:08 KST 환율 job](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39357219977/job/118414676237): `BLOCKED`, `SELECTOR_UNVERIFIED`, providerRequests=1, changedRows=0. HTTP 403이라고 단정할 근거는 없으며, 검증 가능한 환율 selector를 얻지 못했다는 증거다. 원문을 저장하지 않는 기존 정책 때문에 정확한 반환 HTML은 로그에 없다.
- [10/21 09:38 KST 자연 실행](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39522452522/job/118969266958)을 비롯해 이후 조회한 표본은 모두 `SKIPPED_NOT_DUE`, providerRequests=0. 이 로그만으로 오늘 환율 수집 성공이라고 볼 수 없다.
- 현재 코드의 계약 실패 24시간 guard 때문에 10/21 **약 11:08 KST 이후** 첫 기존 자연 실행에서 다시 자격을 얻을 것으로 추론한다. 실제 저장 next_due_at을 직접 읽은 결과가 아니며, job queue/install 시간 때문에 정확한 실행 시각을 보장하지 않는다.
- 공개 신라 홈을 web 도구로 읽었을 때 환율 텍스트는 존재했지만, 검색 도구의 관측/캐시를 수집기 HTTP 계약·게시일·운영 DB 증거로 대체하지 않았다. 표시 숫자를 코드나 D1에 주입하지 않았다.

## 구현한 부분 / 구현하지 않은 부분

1. **실행 상태와 자료 상태 분리**: 수집 실행 뒤 기존 D1 저장 API와 같은 read 함수로 CURRENT / LAST_GOOD / MISSING을 기록한다. 적용일·확인 시각·마지막 상태·오류 코드·다음 가능 시각을 로그에 남긴다. 오늘 값 없는 cooldown skip을 초록 성공으로 숨기지 않으며 script exitCode=1이다. 새 provider 호출 없음.
2. **짧은 내부 조회 harness**: 오늘 저장값이 없는 낮 시간도 30/60/120초 재조회 후 15분으로 복귀한다. 자정/네트워크 재조회와 하루 마운트당 총 12회의 빠른 조회 cap을 공유하며 정상 빈 응답이 이 예산을 초기화하지 않는다. 실제 BLOCKED 상태는 빠르게 조회하지 않는다. 숨긴 탭 정지·focus 5분 guard·동시 1요청·12초 timeout 유지. 방문자는 계속 KORETAIL 저장 API만 읽는다.
3. **Retry-After**: provider 오류의 표준 초/HTTP-date 값을 기존 D1 cooldown보다 늦을 때만 반영한다. 403/406의 최소 24시간, 429의 최소 1시간 guard를 줄이지 않는다. 내부 API도 Retry-After와 403/429 최소 15분 대기를 존중한다. 원천 즉시 재시도 추가 없음.
4. **자정 진실성**: 전날 시작한 요청이 자정을 넘어 도착한 경우 명시 적용일 없는 CURRENT_WIDGET을 새 날짜의 환율로 저장하지 않는다. 실제 명시된 익일 값만 정상 승계한다.
5. **표시**: 오늘 값이 없고 실제 수집 실패/조회 실패가 확인되면 ‘확인 중’ 대신 실패를 표시한다. 상세에는 다음 수집 가능 시각(KST)을 표시한다. 이미 검증한 오늘 값과 어제 값의 원래 날짜/확인 시각은 그대로 유지한다.

변경하지 않은 것: HTML selector/숫자 신뢰 조건, 활성 업체(신라 한 곳), provider URL·headers·credentials, 원천 요청 빈도·24시간 차단 guard, canonical changed-only 쓰기, schema, cron, workflow dispatch, 유료 서비스. 원천 quota가 공식적으로 검증되지 않았으므로 원천에 대한 공격적 반복 요청은 활성화하지 않았다. 코드 상한을 공식 허용 quota로 표현하지 않는다.

## 이번 조사에서 발생한 외부 접근

- 운영 수집기 수동 실행 0회, 운영 DB 쓰기 0회, 원천 복구용 새 scheduler/재실행 0회.
- 원천 정상 read-only HTTP GET 1회 시도, 12초 timeout, 본문 확보 0회. 같은 경로 재시도·UA 위장·프록시 없음.
- 공식 홈 web 읽기 1회(검색 도구 관측; 실제 upstream 호출 횟수는 도구 내부 정보이므로 미측정).
- 신라 cloud-browser 일반 navigation 1회 시도: `Emulation.setTimezoneOverride timed out`로 페이지/DOM 미확보. 후속 tab inventory는 빈 목록. 브라우저 설정·네트워크·IPC 권한 우회 없음. CAPTCHA/보안 차단을 통과한 일이 없다.
- KORETAIL 공개 화면 확인용 cloud tab 생성도 runtime timeout으로 미확보. 이미 보고된 별도 API 1010 차단을 fetch/XHR/다른 경로로 우회하지 않았다.

## 비용/감사 범위

- Provider 요청 증가 0: 기존 claim당 1회, 기존 27/KST day 및 보수적 28/rolling24h 내부 추정 상한을 변경하지 않는다. 공식 quota 또는 전체 계정 안전 보장이 아니다.
- 자연 실행당 witness가 기존 bounded JOIN(최대 1 결과) + 날짜 PK 조회(최대 3 결과)를 추가한다. 96회/day 가정에서 논리 결과 최대 384행/day 추가이며 실제 D1 rows_read/index 비용은 실행 로그의 meta로 확인한다. 관측 이력/raw 저장 증가는 없다.
- Client의 새로운 짧은 조회는 기존 12회 cap 안에서 공유된다. 마운트/새 방문자별 예산이며 전 사용자 전체 요청 상한이 아니다. 사이트 shared cache는 기존 missing 15초 / current 300초 및 자정 만료 그대로다.
- 유료 경로/새 credential/중복 scheduler/forecast 또는 outcome 변경 없음. 원천 HTML 확보·복구 확인·생산 전체 사용량 측정·공개 시각 QA는 아직 미완료.

## 실행 검증

- `node --experimental-sqlite --import tsx --test tests/duty-free-exchange-auto.test.mjs tests/duty-free-exchange.test.ts`: **30 passed**. 기존 실제 local workerd D1/API 검사 2개 포함. fresh/stale/missing, 자정, network, parse failure, 403/429, Retry-After, lease, changed-only, read cap 포함.
- `node --import tsx --test tests/scheduler-truth.test.mjs`: 13 passed (실제 실행은 존재하지 않는 fonts 파일 인자를 함께 주었으나 scheduler 13개 결과만 나왔으며 이를 font 검사로 계산하지 않음).
- `node --import tsx --test tests/font-coverage.test.mjs`: 2 passed.
- 변경 파일 targeted ESLint, `git diff --check`: passed.
- 새 browser 사례 3개 추가: 낮 시간 빈 응답 회복/차단 진실성/Retry-After. 이 환경에서 browser 실행은 하지 않았고 CI 실행이 필요하다.
- 변경 파일과 종속 파일 targeted TypeScript: PASS (`tsc --noEmit --project /tmp/koretail-duty-free-tsconfig.json`, Node types 경로를 지정한 임시 설정, 메모리 1GB 상한). 최초 임시 설정의 /tmp 타입 탐색 경로 오류를 보정한 재실행 결과다.
- 저장소와 동일한 5개 패턴의 working-tree/untracked secret 검사: PASS. 전체 history 검사는 CI에 위임한다.
- 최종 commit/원격 PR/CI/병합/배포 증거는 부모 작업의 GitHub 기록으로 갱신한다. 전체 unit/build를 병렬 실행해 메모리를 소모하지 않았다.
