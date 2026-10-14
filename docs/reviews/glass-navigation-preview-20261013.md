# 유리 내비게이션 비교 시안 — 미공개

사용자 승인 `Sentinel_6936df6afbb48191bd365f897228e6cf`, `Sentinel_633bbe5c7f5c8191a0074aa87d27d10e`에 따른 이미지 검토용 별도 브랜치입니다. 공개 병합·배포는 이 시안의 범위 밖입니다.

원본 SVG 아이콘 7개를 그려 모바일 6개 메뉴와 PC 7개 메뉴(매장 포함)에 적용했습니다. 참고는 https://gitlab.com/noah03161/wedding-invitation 의 MIT 2026 noah0316 배포본이며, 라이선스를 `docs/licenses/wedding-invitation-MIT.txt`에 보존했습니다. 참고 사이트 사진·계좌·로고·famicons는 복사하지 않았습니다.

모바일 바 62px, 곡률 33px, 24px backdrop blur와 불투명 배경 fallback, 누름 .92배, 선택 캡슐 420ms·최대 1.06배, 페이지 전환 7px·320ms를 적용했습니다. 가로 드래그는 가장 가까운 메뉴로 이동하고 세로 드래그는 스크롤에 양보합니다. 키보드 방향키/Home/End·링크 Enter·aria-current·감소된 동작을 지원합니다. 숨김/해제 시 애니메이션을 취소합니다.

검증: Chromium E2E 9개(360/390/430/1440, 4개 언어, 메뉴 보존, 44px 이상 대상, 날짜/지역/뒤로가기, 가로 드래그/세로 스크롤, 키보드와 reduced-motion), 타입, lint, Owner UI Lock, production vinext build, 서버 HTML 49개 통과. 초기 HTML 링크 기본 드래그가 pointercancel을 발생시키는 문제를 발견해 내비게이션 영역의 dragstart를 방지한 뒤 재검증했습니다.

WebKit 26.5 시도 9개는 로컬 HTTP 서버의 기존 CSP upgrade-insecure-requests 때문에 HTTPS 자원을 요청해 SSL 연결에 실패했습니다. 기준본 4222와 시안 4224 모두 hydration 이전에 같은 실패를 재현했습니다. CSP/TLS 보호를 끄지 않았으며 Safari 검증 통과로 주장하지 않습니다. 공개 반영 전 실제 HTTPS WebKit 검증이 남습니다. 구형 Safari fallback은 코드에 있으나 실제 구형 기기 검증은 미실행입니다.

기준 e6d9492b 대비 빌드된 기존 앱 엔트리 gzip 합계 +2,420바이트(JS +1,710, CSS +710), 추가 CSS 요청 없음. 이 결과는 공개 LCP 또는 동작 속도 개선 측정이 아닙니다.

`docs/screenshots/glass-nav-20261013/`의 390/1440px 이미지는 로컬 시안 코드에 공개 API 응답을 읽기 전용으로 연결한 캡처입니다. 데이터는 코드에 하드코딩하지 않았습니다. 가로 넘침·콘솔 오류는 없었고 원본 응답 기준 시각은 evidence.json에 보존했습니다.

보호 변경은 `docs/approvals/glass-navigation-preview-20261013.json`에 정확한 사용자 지시·파일 diff·해시를 기록했습니다. 기존 65개 보호 경로 및 모든 승인 기록을 보존하며 UI Lock을 통과했습니다. 전체 사이트에 이 시안을 반영한 상태가 아닙니다.
