# 공지에서 국가별 실적으로 가는 사용자 여정

## 재현과 최소 수정

2026-11-06 #585 운영 배포 `68c3a382f0846bb564657a25f9a7bd267666ffe2`에서 새 공지의 Next Link를 누르면 URL은 `/ko/airport-countries?mode=passengers#airport-route-passengers`로 바뀌지만 홈 화면이 유지됐다. `RetailPulseApp`의 `view`는 서버가 전달한 `initialView`를 초기 `useState` 값으로 사용한다. 이 경로의 클라이언트 전환은 기존 인스턴스의 홈 상태를 유지했다. 전체 사이트 라우터나 상태 동기화를 바꾸지 않고, 이 새 링크만 기존 사이트의 문서 이동용 anchor 방식으로 바꾼다.

주소·표의 CSS visibility만 확인하는 기존 검사는 실제 도착을 보장하지 못했다. 사용자 요청에 따라 고정 헤더 아래 위치, 첫 행이 viewport 안에 있는지, 실제 hit target, 실적 모드와 잠금 해제를 검사하는 하네스를 먼저 실행했다. anchor만 수정한 버전에서 모바일/PC 최초 진입·More 재열기 **4건 모두 실패**했다. 관측값은 `arrived:false`, `firstRowVisible:false`였고 `headingVisible:true`, `uncovered:true`, `unlocked:true`였다. 스크롤 잠금 문제가 아니라, 나중에 생긴 표로 이동하지 못하는 문제다.

`CountryContents`에는 기존 `useAirportHashReveal`이 연결되어 있지 않았다. 브라우저의 최초 fragment 이동 시점에는 월별 데이터로 생기는 타깃이 없었다. 기존 보정 훅을 **airport-route-passengers 하나로 제한해** 이 뷰에 연결했다. 기존 호출자의 대상·8초 settle 한도·사용자 조작 시 중단 동작은 보존한다. 새 라우터·무제한 폴링·유료 서비스·인증정보·권한·수집 변경은 없다.

같은 엄격한 도착 기준으로 수정 후 **4/4 통과**: 390px native tap과1440px click, 최초 진입, summary/stats 각1.8초 지연, More의 실제 공지 버튼, 동일 URL에서 공지 컴포넌트의 지원 재열기 이벤트 후 실제 링크 재클릭, Back/Forward. 동일 URL의 native fragment 클릭은 문서 요청이 필요 없으므로 그 경우에만 네트워크 요청 기대를 구분하며, 실제 viewport·헤더·행 기준은 동일하다. 검사 자체에서 목적지를 scrollIntoView 하지 않는다.

## 하네스와 배포 순서

1. `e2e/update-notice.spec.ts`의 `notice passenger journey` 4건이 실제 공지 링크를 클릭한다. `e2e/helpers/notice-passenger-journey.ts`가 실적 탭의 aria-selected, 실제 표 행, 타깃 top이 sticky bar 아래0~32px, 제목·첫 행의 viewport 포함, elementFromPoint 가림 여부, document/body 스크롤 잠금 해제를 검사한다. bbox JSON과 스크린샷을 남긴다.
2. 기존 CI의 `country-tooltip-and-search-identity-chromium`은 이미 update-notice.spec.ts를 명시 실행한다. 전체 browser inventory는 각 발견된 검사가 네 분할에 정확히 한 번 포함됨을 검증하고, 네 분할도 필수다. 테스트 목록을 축소하지 않는다.
3. `e2e-production/notice-passenger-journey.spec.ts`는 같은 여정/위치 단언을 **실제 운영 자료**에 적용한다. fixture나 API mock 없이, 실제 공지 클릭·More 재열기·같은 URL·Back/Forward와 운영 API 월/일본 수치 일치를 검사한다. 기존 분석 opt-out과 Google tag 차단을 사용한다.
4. `deploy-cloudflare.yml`의 코드 업로드 및 정확 revision 기록 뒤 이 운영 검사 파일을 **continue-on-error 없는 필수 완료 게이트**로 실행한다. 실패하면 업로드된 코드를 검증된 릴리스로 선언하지 않고 배포 workflow가 실패한다. 자동 rollback을 주장하지 않는다. 정확 SHA 전후 검사는 기존 production-revision-setup을 재사용하며, 실패 시에도 notice-passenger-release-verification artifact에 근거를 저장한다.
5. 기존 자동 Production Visual Check도 e2e-production 전체에 이 파일을 포함한다. `tests/ci-browser-shards.test.mjs`는 CI 경로 및 strict production gate가 누락·무시되지 않는지 검증한다.

## 별도 운영 검사 한계

원배포 Production Visual Check42182131312는 **82 passed**. 별도 Smoke42182242131에서 `ok:false`는 `/ko/about`의 `about page is live` **한 건**이었다. HTTP200이고 title은 `코리테일 소개 | 인천공항 중심 데이터 서비스 KORETAIL`지만 서버 HTML에는 스모크가 기대하는 `KORETAIL은 무엇인가요`가 없다. 이 소개 구현과 스모크 파일은 시작 main c2ae784~배포68c3a382 사이에 변경되지 않았다. 공개 API 전반 실패나 KASI 상태를 이 실패 원인으로 추정하지 않으며, 이 링크 수정에 무관한 소개/스모크 변경을 섞지 않는다.

최종 exact HEAD CI·merge·운영 SHA와 실제 클릭 결과는 후속 PR #586에 기록한다. 공식10월 값·공지 본문·버건디 제목은 #585 검증값 그대로 유지한다.
