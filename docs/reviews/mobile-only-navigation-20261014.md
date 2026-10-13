# 모바일 하단 전용 내비게이션 시안

사용자 지시 `Sentinel_94fc9be8c4d481918fc5cb435181585c`: “피씨아이콘은 바꾸지말고 모바일만바꿔저 아이콘!!!!”

PR367의 이전 PC 아이콘 시안을 대체한다. 기준 main은 `fcf529e0ec8405d10d3ba724a469eeab67fc3e71`이며 GA4, SEO, 날짜, 출국·환승 구분 등 최신 운영 변경을 병합해 보존했다. 이번 결과는 로컬 검증과 Draft PR까지이며 공개 병합·배포는 하지 않는다.

모바일 하단 6개 메뉴에만 기존 시안의 SVG 아이콘과 유리 바를 유지했다. PC 상단 메뉴 JSX는 기준 main과 동일하며 시안의 PC 아이콘·스타일을 제거했다. PC 7개 메뉴와 매장 진입은 유지한다. 모바일에서 PC로 크기가 바뀔 때 시안의 진행 중인 애니메이션을 취소한다.

스크린샷은 외부 호출을 차단한 로컬 fixture이며 운영 실시간 자료가 아니다. 이전 `glass-nav-20261013` 폴더는 역사 기록이고 현재 시안은 `docs/screenshots/mobile-only-nav-20261014/`에 있다.

- 모바일 Library: `libfile_f7bb351442b881918ec4bbdc9aa9ff20`
- PC 유지 확인 Library: `libfile_ffc80d3f53cc8191b9e742c7e90a5297`

타입, 변경 파일 lint, Owner UI Lock 65개, 전체 단위 1,556개, production build, 렌더 HTML 49개를 확인했다. 브라우저 59개 범위 중 57개가 첫 실행에 통과했고 PC 링크 선택자 1개와 로컬 소켓 연결 실패 1개는 원인을 구분했다. PC 선택자를 기존 운영 href에 맞춘 뒤 날짜·뒤로가기·safe-area 전체 24개를 다시 실행해 모두 통과했다. 검사나 UI Lock을 끄지 않았다. 전체 이력 1,256개와 작업 트리의 비밀 검사도 통과했다. CI SHA는 PR의 최신 검증 기록을 따른다. Windows에서는 bash wrapper 대신 동일 vinext build CLI를 실행했고 CI가 Linux wrapper를 검증한다. 로컬 서버 시작 전 접속 실패와 sandbox Miniflare 시작 실패는 성공으로 계산하지 않았으며 준비된 환경에서 재검증했다.

Web Interface Guidelines 검토: 장식 아이콘 aria-hidden, 이름이 있는 링크, 키보드 조작, focus-visible, reduced-motion, safe-area와 기존 visualViewport 보정 유지. 실제 iOS Safari 검증은 미실행이며 Chromium API emulation을 실제 기기 검증으로 주장하지 않는다.

DB/API/수집기/캐시/GA4/SEO의 기능 변경은 없다. D1 사용량 경고와 신규 API 인증 문제는 이 시안과 독립된 조사이며 공개 사이트 호출 없이 검증했다.
