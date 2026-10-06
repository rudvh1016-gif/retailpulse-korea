# 출국장 대기와 PC 월 누적 정렬

- 시작 main: `565c0341cfd2cea1ff9d2eaccdd68283f7179701` (2026-10-06 확인).
- 범위: 준비된 `airport_queue_color_v2` 연결, PC 비교 폭·정렬. 기존 출국 준비, 승객/직원 재배치, FlightBoard timeout, 국가 비교 구현은 포함하지 않는다.
- 공개 `/ko/airport?terminal=T2`를 Chromium 1280px에서 열어 HTTP 200, 오류 overlay 없음, pageerror 없음과 세로 목록/오른쪽 공백을 확인했다. 당시 값은 2B 11분·308명, 2A 9분·289명, 관측 18:22였다. 이는 화면 확인 당시 값이며 현재값으로 고정하지 않는다.
- 로컬은 production D1을 사용하지 않는다. 재현 스크린샷은 명시적인 E2E fixture이며 운영 자료가 아니다.

## 재사용 자산

사용자 컴퓨터의 기존 실제 Blender Cycles 원본과 계약을 읽고, WebP를 직접 디코딩하여 RGBA·네 모서리 알파 0을 확인했다. 원본을 새로 제작하거나 수정하지 않았다.

| 파일 | 바이트 | SHA-256 |
|---|---:|---|
| queue-checkpoint.blend (원본 보존) | 179231 | 28557b646c7b1c12cfb1862d17afad42c441c709db64ff44afcc5fac279e7d36 |
| queue-checkpoint-192.webp (192×144) | 7660 | b8e1d5cc06a154e633fdb647add67fccbe7cfb5876bbad583e5ba2e1625ad2b4 |
| queue-checkpoint-384.webp (384×288) | 17746 | e2431b5aa259d7d22e9df94345305fdb8dfb25a070902a4c1c7c3eb903f21113 |

원본 계약 Library: `libfile_9405c60ee0b48191b50dcabe59864676`. 웹 묶음: `libfile_bef765db0d38819195dea4e71e600de8`. 명시된 로컬 파일이 이미 존재하므로 Library 가이드의 local-path 경로로 소비했다. 사이트에는 최적화 WebP 두 개(총 25,406B)만 넣는다.

동일한 장비·사람 모형을 모든 출국장에 재사용한다. 민트/하늘색은 장비 재질이며 혼잡/안전 등급이 아니다. 사람 세 명은 실제 인원이 아니다. 장소별 좌표·실내 길찾기 의미는 없다. 출국장 이름, 대기시간, 인원, 관측 시각은 모두 기존 HTML·자료를 유지한다.

## 변경

- `app/live-signals.tsx`: 기존 목록에 responsive image 추가, 카드 wrapper, 실제 접힘 영역을 가리키는 aria-controls, 모형 설명 한 문장. 기존 정렬·원문 시간 범위·null·0·지연 표시·터미널 선택·접기는 그대로 유지.
- `app/airport-models.css`: 터미널별 그룹을 전체 폭에 배치, PC 4열/모바일 2열. 기존 글자 크기·서체 유지, 검정 텍스트.
- `app/airport-month-comparison.tsx`: PC 전용 HTML 막대로 글자 확대 없이 가용 폭을 사용. 기존 모바일 SVG 유지. 동일 0 기준·동일 최대값·정확한 두 값 사용.
- PC 월 누적의 제목·총합·전월 정보를 왼쪽에 정렬하고 비교 막대를 오른쪽에 배치. 날짜별 막대는 아래 전체 폭, 모바일은 기존 형태 유지.
- 새 API, 수집기, 스케줄, D1 읽기/쓰기, 계정, 결제, 의존성 없음. 정적 이미지 lazy-load만 추가. 실제 Free-tier 안전성의 새로운 측정 주장 없음.

## 국가 비교 조사만

main은 36px 국기와 2열 `.airport-zone-country-grid`를 쓴다. 기존 PR278의 준비안은 이미 WEST/CENTER/EAST를 PC 3열로 나란히 보여 주고 미확인은 별도 행, 기본 접힌 주의사항을 제공한다. 로컬 후속안은 20px 국기와 국가명/편수·비중 줄바꿈, 모바일 320/390/430px까지 3열을 포함한다. PC에는 같은 3열을 그대로 적용할 수 있어 새로운 구현이 필요하지 않다.

PR278 원격 HEAD `e567637ecde71b213c351f12323fb91c15f60461`과 미게시 후속 작업은 구분한다. 기존 보호기준 commit/push 거절과 PR276 병합 거절을 재시도하거나 우회하지 않았다. 이번 변경에서 국가 비교 파일은 수정하지 않는다.

## 검증 기록

- `npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .playwright-browsers`: 오류 0, 기존 이미지 경고 7.
- `npx tsc --noEmit`, `npx vinext build`: PASS.
- Node `--experimental-sqlite --import tsx --test --test-concurrency=4` 전체 단위 검사: 1,163 PASS. 버튼의 `aria-controls`가 실제 목록 ID를 가리키는지 기존 검사를 갱신했다. 보호 파일 검사는 계속 활성 상태다.
- `node --test tests/rendered-html.test.mjs`: 42 PASS.
- Playwright 관련 다섯 파일 (`airport-queue-model`, `airport-month-daily-trend`, `airport-priority-lock`, `approved-release-regressions`, `production`): 첫 실행 123 PASS / 서울 3 FAIL. 실패 시 Vite의 `Failed to load url ...vinext...http-error-responses.js`가 기록됐다. 해당 서울 3개는 변경 없는 main `565c034`와 이 브랜치에서 각각 단일 worker로 3/3 PASS. 제품 코드를 추가 수정하거나 실패 검사를 제외하지 않았다. 원격 전체 CI를 별도로 확인해야 한다.
- 대기 4언어 × 320/390/430/1280px, T1/T2 전환, Enter/Space 접기, 연속 클릭, 원문 범위·지연·null·0, 기존 13px 이름, reduced motion, 가로 넘침 검증.
- 월 누적 모바일 320/390/430px과 PC 821/1280/1600px 검증. PC 막대 숫자 14px, 실제 비율·null 누락·터미널별 값 분리 유지.
- `node --import tsx scripts/health.ts`: HARNESS PASS / SYSTEM UNKNOWN (로컬에서 production DB 미연결). 새 API·수집·스케줄·D1 변화가 없어 architecture benchmark는 적용 대상이 아니다.
- React와 Web Interface Guidelines 검토: 장식 이미지 alt 빈값·고정 크기·lazy decoding, 실제 버튼과 포커스, 기존 언어/숫자 출력, 새 상태/네트워크 요청 없음.

스크린샷은 `docs/screenshots/airport-queue-20261006/`: `public-*-before.png`는 실제 공개 화면 확인 시점의 값, 나머지는 위에 명시한 fixture 값이다. 브라우저 캡처에서 고정 메뉴만 숨겨 대상 카드가 가리지 않게 했다.

`node scripts/secret-scan.mjs`: 작업 파일·도달 가능한 Git 이력 전체 PASS.

## 게시 차단

커밋 시도 1회가 프로세스 실행 전에 자동 승인 검토에서 거절됐다. `tests/fixtures/phase2-locks.json`의 보호 기준 변경에 대해 정확한 승인이 확인되지 않았다는 사유다. 기존 검사와 파일 목록은 유지하며 `app/live-signals.tsx`의 해시만 `73a68b4da19f835f7946aa0fefd83fce4e0e71df01c517d5e1302953b332f060`에서 `eaf2709b09abd8b88996aea680ae07df1745277f04849407e9d4ebd1aae45509`로 갱신한 준비안이다.

커밋·push·PR·새 CI·병합·배포는 실행되지 않았다. 인덱스는 비어 있고 HEAD는 시작 main 그대로다. 작업을 보존하고 거절된 게시를 재시도하거나 우회하지 않는다. 공개 반영 완료로 보고하지 않는다.
