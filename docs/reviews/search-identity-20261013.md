# 코리테일 검색 이름과 핵심 설명

기준 main fea8249c3bcef134077684cb5c92049ea83bb477

검색에 보인 일반적인 소개 문구를 서비스 핵심으로 바꾸고 기존 `/about` 방문이 404로 끝나는 문제를 수정

- 홈 제목: 코리테일 KORETAIL | 인천공항 대기·항공편과 서울 상권 정보
- 소개 제목: 코리테일 소개 | 인천공항·서울 상권 데이터 서비스 KORETAIL
- 검색·공유 설명 핵심: 인천공항 출국장 대기·항공편 흐름과 서울 주요 상권의 혼잡·소비 정보를 한눈에
- 소개 첫 문구에도 같은 기능 설명 표시
- WebSite 대체 이름에 코리테일 추가
- `/about` → `/ko/about` 영구 이동

Claude의 `/ko` 대표 주소, airport-glance 동일 페이지 처리, hreflang, 사이트맵 제외 규칙과 robots의 데이터 렌더 허용 정책 유지
소개 페이지는 자체 canonical과 색인 허용 유지
평점이나 후기 없는 WebApplication 구조화 데이터를 다시 추가하지 않음

## 실제 운영 원문 기준선

`search-identity-public-before-20261013.json`은 JavaScript를 실행하지 않는 공개 GET 확인 결과
분석 이벤트나 외부 데이터 수집 요청 없음

- `/` 308 → `/ko`
- `/ko` 200 및 기존 공항 한눈에 제목
- `/about` 404
- `/ko/about` 200 및 사용자 지적과 동일한 일반적인 소개 제목·설명
- robots.txt와 sitemap.xml 200
- `/favicon.ico`와 `/favicon-20261007.ico` 모두 200이며 저장소 승인 비행기 아이콘과 동일한 SHA256 `8d78d5708cdecec4ec251689c1887cb944936361ad03878d8344e7bcae058432`

승인된 192px 아이콘 실제 픽셀을 확인했으며 비행기·활주로 이미지
검색에 남은 파란 4칸과 현재 운영 파일이 다르므로 새 로고를 임의 제작하거나 favicon URL을 다시 교체하지 않음
OG 이미지도 기존 승인 비행기 자산 유지

## 검증

- TypeScript 및 변경 파일 ESLint 통과
- 메타데이터·파비콘·canonical·UI Lock 포함 관련 단위검증 52개 통과
- Windows native vinext build 통과
- 렌더 HTML 검증 49개 통과
- 실제 로컬 HTTP/Chromium E2E 3개 통과: `/`와 `/about` 308, 원문 제목·설명, sitemap canonical, 390/1440px 소개 화면 hydration 후 title/meta/visible copy 일치, 가로 넘침 없음, pageerror 없음
- 기존 빈 공유 설명 검사만 새 승인 설명의 정확한 값 검사로 갱신하고 색인·canonical 검사는 유지
- UI Lock 보호 경로 65개 유지, 세 파일의 정확한 diff와 사용자 승인 근거를 정상 승인 기록에 보존
- 런타임 의존성·수집기·스케줄·계정·보안 설정 변경 없음

## 남은 단계

이 PR은 초안이며 공개 병합·배포하지 않음
배포 후 동일 공개 원문 확인을 다시 실행해야 변경이 실제 서비스에 도달했는지 확정 가능
검색 노출 결과는 재수집·처리 뒤 바뀌며 즉시 변경이나 순위·대표 URL 선택은 보장할 수 없음
Search Console 접근이나 색인 요청은 이 작업에서 실행하지 않음

Google 공식 지침: [favicon](https://developers.google.com/search/docs/appearance/favicon-in-search), [site name](https://developers.google.com/search/docs/appearance/site-names)
favicon은 홈의 link 태그와 크롤링 가능한 안정적인 자산을 사용하며 재처리에 수일~수주가 걸릴 수 있음
무료 후속 확인은 배포 확인 뒤 Search Console URL 검사에서 `/ko` 재색인 요청 한 번
