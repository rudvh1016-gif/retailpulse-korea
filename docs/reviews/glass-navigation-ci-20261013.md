# 내비게이션 시안 CI 회귀 검사 정합성

원격 CI 38405601561은 ae93204c55acdc7aa38ccd7d44ad2408bb39466c에서 E2E 1355개 통과 / 8개 실패
Secret·lint·typecheck·unit·health·build·render·dependency audit는 통과

## 실패 원인과 수정

7개 테스트는 날짜와 지역이 실제 href에 보존되도록 개선된 링크를 쿼리 없는 주소와만 비교
airport-default-start 2개, airport-intent-preload 1개, approved-release-navigation 2개, personal-briefing 1개, premium-demand 1개

날짜·지역을 포함한 완전한 주소로 selector를 갱신하고 소비 탭 도착 경로는 정확한 pathname과 search를 각각 검사
기존 날짜 입력·브라우저 뒤로/앞으로·새로고침·터미널·지역·비행기 화면 사전 로딩 방지 검증 유지
넓은 부분 주소 매칭이나 테스트 skip을 추가하지 않음

나머지 1개 pure-white 검사는 54px 높이의 작은 선택 표시를 큰 반투명 화면 배경으로 분류
기존 소유자 승인 `Sentinel_6936df6afbb48191bd365f897228e6cf` 및 `Sentinel_633bbe5c7f5c8191a0074aa87d27d10e`에 따른 비공개 glass navigation 시안 범위
정확한 `.glass-nav-indicator` selector와 `rgba(255, 255, 255, 0.64)` 값만 예외로 인정
동시에 실제 DOM에서 단 하나의 표시가 보이는 nav의 직접 자식인지, 높이 54px·메뉴 한 칸 이하 너비·absolute 위치이며 전체 사각형이 nav 내부에 있는지 검사
기존 모든 페이지의 흰 배경 검사와 다른 반투명·tinted 면 검사는 그대로 유지

## 범위

애플리케이션 코드·CSS·보호 manifest·승인 receipt 변경 없음
기존 디자인과 승인된 쿼리 보존 동작을 유지하는 테스트 정합성 수정만 수행
CI workflow와 검증 강도를 낮추는 skip·timeout 증가·재시도 증가는 없음
공개 병합·배포 없음

## 재검증 결과

- 실패가 있던 6개 E2E 파일 전체와 glass-navigation-preview의 9개를 포함해 96개 통과
- 360/390/430/768/1280/1440/1920px 및 4개 언어 포함
- TypeScript·변경 파일 ESLint·UI Lock 통과
- 제품 코드가 바뀌지 않아 기존 ae93204c 빌드 성공 증거를 유지하며 불필요한 재빌드는 실행하지 않음
