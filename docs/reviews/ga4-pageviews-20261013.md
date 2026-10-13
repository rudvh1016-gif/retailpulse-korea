# GA4 페이지 조회 누락과 동의 진입 수정

## 범위와 근거

- 기준 main fea8249c3bcef134077684cb5c92049ea83bb477
- 사용자 승인 Sentinel_0d25b8d32004819196865c7f721db2b9 및 Sentinel_e187a7e0bd708191a23d94b0f97bd844
- 독립 브랜치 codex/ga4-pageviews-20261013에서 최소 수정과 격리 검증 및 Draft PR만 수행
- 실제 GA 계정 설정·보안·OAuth·키·필터·향상된 측정 설정·배포를 변경하지 않음

## 확인한 결함과 아직 모르는 것

기존 lib/personal-analytics.ts는 send_page_view:false로 자동 조회를 끄고 허용 이벤트에도 수동 page_view가 없었음
동의 후 사용자 기능 이벤트는 존재하지만 조회수 수집 경로가 없는 결함을 확인
기존 page_location은 origin만 전송하므로 보고서 경로가 /로 묶일 수 있음
개인 브리핑 진입이 제거된 이후 새 이용자가 선택적 이용 통계에 동의할 공개 화면도 없었음
이 때문에 동의가 저장된 과거 이용자와 새 이용자의 수집 조건이 달랐음

사용자 화면의 10월 12일 조회 0·활성 0·이벤트 2, 최근 28일 활성 3·이벤트 188, 최근 7일 페이지 자료 없음은 관찰값
이 수치만으로 실제 방문자가 없었다거나 모든 이벤트가 유실되었다고 판단하지 않음
동의 거부·차단기·빌드 설정·속성/스트림 불일치·데이터 필터·보고서 날짜/시간대·처리 지연은 별도 확인 대상
역사 기록 docs/PERSONAL_BRIEFING_OPERATIONS.md의 9월 8일 계정 설정 확인을 오늘의 설정 확인으로 재사용하지 않음

2026-10-13 GitHub production 환경의 공개 변수 두 개만 읽어 ENABLED=true와 유효한 G- 측정 ID 존재 확인
개별 공개 ID 원문은 문서에 중복 저장하지 않음
배포 workflow는 두 변수를 빌드에 전달하도록 연결되어 있음
운영 HTML의 수동 Python HTTP 조회는 403으로 끝나 실제 운영 번들 내용은 이 검사에서 확인하지 못함
GA4 속성을 읽을 수 있는 연결 도구가 없어 실제 보고서·실시간 수신·필터·스트림 일치는 미확인

## 변경 동작

- 더보기의 독립 선택적 이용 통계 checkbox로 동의·철회를 제공하고 기본값은 OFF
- 개인 브리핑을 재노출하거나 역할·지역 기본값을 임의 저장하지 않음
- 별도 koretail-analytics-consent-v1 키는 true/false만 보관하고 기존 개인 설정은 그대로 보존
- 새 선택이 없을 때 과거 저장 동의를 유지하고 철회하면 그 과거 값보다 새 OFF가 우선
- 다른 탭의 철회와 저장 초기화에 반응하며 저장 차단 때에는 현재 탭에만 적용된다는 안내
- 루트의 단일 관찰자가 동의 후 최초 렌더와 SPA pathname 이동·뒤로가기를 기록
- 같은 경로 재렌더와 쿼리·해시만 변경은 추가 조회로 세지 않음
- 공개 정적 경로 allowlist만 page_location에 사용하며 자유 경로·검색어·쿼리·해시·원문 제목·referrer·개인 내용 제외
- 기존 사용자 기능 이벤트의 origin-only 제한과 광고 denied, Google signals/personalization false 유지
- 자동 page_view와 Enhanced Measurement 해제 요구 유지해 중복 및 자동 검색어 전송을 방지
- 미동의 상태의 페이지 조회는 저장하거나 뒤늦게 재전송하지 않음

## 검증

- TypeScript 및 관련 ESLint 통과
- 개인 분석 5개와 운영/Owner UI Lock 44개 총 49개 통과
- native vinext build 및 HTML 렌더 49개 통과
- 로컬 가짜 G-TEST1234 빌드에서 실제 Google SDK/수집 도메인 요청을 모두 가로채 전송 없이 검증
- 최초 조회 1회 → 소개 이동 2회 → 뒤로 3회 → 철회 후 이동에도 3회 유지
- 4개 언어, 360px/390px, 키보드 Space, 저장 차단, 기존 동의 유지와 다른 탭 철회 동기화 검증
- 기존 개인정보·환경 조건 테스트 유지하고 새 수동 경로 테스트는 미동의·철회·재렌더·불허 경로·private 문자열 누출 방지 검증
- 보호 경로 목록과 기존 승인 기록 유지하며 실제 변경 해시와 새 승인 receipt만 정상 갱신
- React 및 저장소 web-design-guidelines 검토에서 네이티브 label/checkbox, 이름/설명 연결, 상태 안내, 안정적인 effect 의존성 확인
- 컬렉터·D1·스케줄러·유료 서비스·보안 설정 변경이 없으므로 해당 아키텍처/쿼터 재설계는 비대상

## 실제 보고서 확인의 남은 단계

현재는 코드 수정 검증 완료이며 GA4 실제 수신 완료가 아님
이 PR의 승인된 운영 반영 후 소유자가 같은 KORETAIL 속성의 실시간 보고서를 열고 더보기에서 동의한 자신의 브라우저로 소개 페이지를 한 번 방문해 page_view와 /ko/about 수신을 확인하는 한 번의 관찰이 필요
차단기가 켜져 있거나 동의가 없으면 미수집은 의도된 동작이며 임의 우회하지 않음
수신되면 이후 페이지 및 화면 보고서에서 수정 반영 후 날짜 범위를 확인하고 과거 누락 조회가 소급 복구된다고 기대하지 않음
수신이 없으면 해당 한 번의 브라우저 Network 결과와 스트림 ID 일치·필터·날짜/시간대를 읽기 전용으로 비교하되 새 계정 연결이나 설정 변경은 별도 범위

공식 근거

- [Google 수동 페이지 조회 및 중복 방지](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Google SPA 페이지 조회](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
