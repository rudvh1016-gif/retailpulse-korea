# 확인된 기존 공식 뉴스와 작은 Blender 아이콘

2026-10-10 UTC. PR329의 제한된 화면 보완과 공식 자료 검증 기록이다. 사용자 후속 승인으로 SQL0026과 검토된 두 건의 일회성 운영 저장 경로를 추가했다. 공개 병합·배포·자동 수집은 실행하지 않는다. 실제 자료 입력은 전용 CLI에만 연결하며 화면 번들에 fixture나 기본 seed로 넣지 않는다.

## 자료 두 건

| 자료 | 발표·시행 | 권리와 내용 근거 | 미확인 부분 |
|---|---|---|---|
| 관세청 10174903, 국민과 함께 뽑은 ’26년 관세청 적극행정 우수사례 | PDF 2026-08-28 16:30 KST 발표. 환불 개선은 2026년 4월, 출국 취소 재입국 면세범위 개선은 2026년 2월 시행. 정확한 시행 일자는 만들지 않는다. | [개별 원문](https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?bbsId=1362&mi=2891&nttSn=10174903&nttSnUrl=02f1a911f786eb750b0034fd1b89c2a7), [확인한 PDF](https://www.customs.go.kr/common/nttFileDownload.do?fileKey=543f1b9baa9874782ac80419c1f9f9b0). 실제 PDF 5쪽 텍스트와 2쪽 출처표시 제1유형 마크를 확인. 문서 텍스트의 요약에만 적용하며 사진·HTML 전체의 권리로 확대하지 않는다. | 원문 HWPX는 확인 대기. 환불 개선은 납부기한 전이고 해당 관세 미징수라는 두 조건을 보존. 같은 문서를 여러 뉴스로 나누지 않는다. |
| 관세청 10168489, 관세청, 면세품 교환 문턱 낮춘다 ··· 이용객 편의 대폭 개선 | 공식 등록 2026-07-02, 시행 2026-07-01. 등록일만 확인된 자료의 시각은 알 수 없으며 저장 시 KST 달력 날짜로 정규화한다. | [개별 원문](https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=10168489&nttSnUrl=0f5da1192552535ef4de3e6864a7bdb8), [같은 자료의 정책브리핑 공식 전재](https://www.korea.kr/briefing/pressReleaseView.do?newsId=156769316&pWise=sub&pWiseSub=J2). 해당 전재의 텍스트 한정 공공누리 제1유형 조건 확인. | 원본 PDF의 조사 응답 502/400 때문에 PDF 검토 완료로 기록하지 않는다. HWPX/PDF 모두 확인 대기. 사진·이미지 등은 사용하지 않는다. |

교환 요약에는 미화800달러 이내, 국내 방문·우편·택배, 불량·하자 없는 동일 물품 또는 동일 모델의 색상·크기 등이 다른 물품이라는 조건을 보존한다. 면세범위를 초과하면 입국 휴대품 신고 후 세금 납부가 필요하며, 면세점별 교환 정책을 확인하도록 한다. 발표일과 시행일을 나눠 보여 주고 7~8월 기존 자료를 새 속보로 표시하지 않는다. 제목·관세청·작성자·연도·발표일·원문·권리 근거와 자료 요약 표시를 보존한다.

실제 저장된 원문·첨부 bytes/SHA와 수동 검토를 두 개의 고유 sourceId에 연결했다. private SQLite→변경 없는 저장 전용 API 검증은 최초 current2/revision0, 동일 재처리 current0/revision0, STORED/items2이다. 문서 확인 완료1, 확인 대기3이다. 이 결과는 공개 사이트의 DB 반영을 의미하지 않는다.

## Blender 결과

Blender5.2.1 LTS에서 실제 `airport-news.blend`, `customs-news.blend`를 저장·렌더했다. 공항 아이콘은 승인 D_T1.blend의 항공기 메시63개와 소재를 재사용했다. 관세·면세 아이콘은 같은 하늘색·흰색·소량 민트의 여권·짐·확인 문서로 만들었다. 원본 D 파일과 홈페이지 모형은 수정하지 않았다.

웹에는 각64/128/256px 정적 WebP만 사용한다. 여섯 파일 전체22,882bytes이며 해당 화면 크기·기기 해상도에 맞는 파일만 선택한다. 진입 버튼은 기존80px 높이·같은 위치와 너비를 보존하며, 아이콘48px 모바일/80×60px 데스크톱이다. 두 탭 아이콘은32px이다. 제목 앞과 목록·상세에는 반복 그림을 넣지 않는다. width/height와 CSS 크기를 예약하고 진입 이미지에는 lazy, 비동기 decoding을 사용한다. 새 폰트·3D 엔진·모션·런타임 이미지 변환 서비스를 추가하지 않는다.

## 아직 실행하지 않은 운영 조치

일반 화면·코드·첨부 검증·로컬 저장·초안 PR 수정은 요청된 구현 범위이다. 이번 위임은 운영 DB 쓰기와 수집 활성화 실행을 제외하고 있다. 다음 작업은 서로 다른 대상이다.

1. **production D1 schema**: `wrangler.production.jsonc`의 `retailpulse-korea-production` (`a86b7e71-ddd8-4677-a65d-aa11490c578c`)에 SQL0026의 `official_news_current`/`official_news_revision`·index·capacity trigger를 검토 후 적용해야 한다. 이번에는 적용하지 않았다. 다른 미적용 migration을 함께 실행하지 않는다. staging DB는 저장소에 placeholder라 실제 staging 계약/usage 측정을 완료한 것으로 기록할 수 없다.
2. **canonical records**: 개별 자료의 문서/텍스트 권리로 확인한 두 기록을 기존 `storeOfficialNews`의 bounded atomic changed-only 경로로 저장해야 한다. 임의 SQL INSERT로 공개 DB에 넣지 않았고 production fixture seed도 없다. local source-review·SHA·prepared-records는 별도 검토 산출물이다.
3. **operational collection**: CLI가 `CUSTOMS_NEWS_COLLECTION_REVIEWED=false`에서 환경/HTTP/DB 접근 전 DORMANT로 종료한다. runtime `RPK_CUSTOMS_NEWS_COLLECTION_ENABLED`, 기존 `ENABLE_PRODUCTION_COLLECTOR`, 전용 `CLOUDFLARE_D1_WRITE_TOKEN`도 실행 조건이다. 전용 토큰 보유/권한은 미확인이다. 새 발급이나 권한 확대가 필요한 것으로 단정하지 않는다. workflow·schedule은 만들지 않았다. 수동 문서 근거로 확인한 이 두 건이 HTML 마크 전용 자동 adapter의 신규 권한이 되는 것은 아니다.
4. **evidence before activation**: 실제 remote D1 atomic contract/rows_read·rows_written/index amplification/Worker CPU/사이트 공유 quota/70·85·95 usage guardrail은 미검증이다. 로컬 SQLite 성공·LIMIT50·4.69MiB payload 상한으로 운영 무료 안전성을 주장하지 않는다. 이는 측정·검증 미완료이며 결제나 새 권한을 허용받아야 한다는 뜻은 아니다.

A1 PR332 승인·실행 스위치는 별도 범위이다. 뉴스 collector 활성화를 A1 승인으로 간주하지 않는다. 사용자 병합·별도 운영 반영 조건까지 공개 사이트의 뉴스 완료로 표현하지 않는다.

## 이번 보완 검증과 산출물

새 아이콘 변경은 typecheck, 변경 TSX lint(오류0, 정적 img 권고1), private Native Node build, 기존 뉴스 E2E20건을 통과했다. 실제 두 자료를 사용하는 별도 브라우저 검증은 360/390/430/1280에서 목록/상세·발표/시행 분리·환불/교환 요건·키보드/Escape 복귀·글자 표시·이미지 크기를 확인했다. 오류·외부 원문/사진 요청0, 가로 넘침0, 두 탭32px와 기존 진입80px를 확인했다. 이미지·폰트 검사를 끄거나 fixture를 바꾸지 않았다.

초기 로컬 서버 sandbox 포트 접근, 잘못 지정한 Windows Chromium 경로, private tsx 캡처의 이름 보조 함수 누락은 정상 검증을 시작하기 전 설정 실패였다. 원인을 수정했고 실패 로그도 보관했다. 실제 앱 테스트 실패로 위장하거나 삭제하지 않았다. 뉴스 기능의 기존 unit35/통합unit1349/영향받은 E2E110 결과와 최종 원격 CI는 별도 HEAD의 결과로 구분한다. 이번 WebP 용량 측정은 공개 사이트 PSI/LCP 전후 비교나 운영 속도 개선 증명이 아니다.

Library 이미지(모두 실제 픽셀 확인, version0):

- 기존 위치의 동일 크기 진입: `libfile_9c04723f646c8191b7246fc8ae327922`
- 실제 두 자료 목록: `libfile_314278b049bc81918b758a9c52454839`
- 환불 자료 상세: `libfile_8b7e3343b53c8191a7de797d6c436977`
- 교환 자료 상세: `libfile_9ca6073205a88191beb1a4b9a6c1552b`
- Blender 공항 아이콘: `libfile_ac8574db6fb4819191598c095289a731`
- Blender 관세·면세 아이콘: `libfile_b1831831349c8191bc3ab568dd1ea70c`

로컬 산출물 루트는 `outputs/news-preparation-20261010`이며 원문·첨부 SHA, `related-reviewed-records.json`, `related-source-review.json`, `related-real-storage-evidence.json`, `related-real-browser-evidence.json`, `.blend` 두 개와 생성/내보내기 스크립트·WebP 용량 증거·Library identity sidecar를 보존한다. Windows의 POSIX xattr 미지원으로 Library ID/version은 sidecar에 기록했다. 준비 기록 두 건만 승인된 전용 일회성 import에 연결했다. 자동 수집과 화면 seed는 없다.

## 최신 사용자 그림 배치 및 운영 저장 승인

사용자 요청 Sentinel_fe29852ed3fc8191849a41b4a4d94dce에 따라 기존 항공기 렌더는 왼쪽 출국 준비 가이드로 옮기고, 오른쪽 뉴스 진입에는 실제 Blender paper-news.blend의 하늘색·흰색 종이 렌더를 사용했다. 내부 두 탭 그림은 유지한다. 버튼 위치·80px 높이·너비·글자·열기 동작은 같다. 새 종이 WebP64/128/256은1,144/2,326/4,888B, 추가 파일 합계8,358B다. 이 파일을 모두 한 화면에서 다운로드하지 않는다. 기존 출국 그림25,566B 요청은 반응형 항공기 그림으로 바뀐다. 실제 PSI/LCP 개선 측정으로 해석하지 않는다.

저장 승인 범위·용량 실측·기존62일 월 비교 원자료 보존은 NEWS_STORAGE_MINIMIZATION_2026-10-10.md에 기록한다. 원격 실행 여부와 최신 자동 검사 결과는 PR 및 실행 증거에서 구분한다.
