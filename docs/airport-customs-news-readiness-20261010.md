# 인천공항·관세 뉴스 준비 상태

## 최신 연결 코드 — 공개 반영·운영 수집 미실행

2026-10-10 UTC 후속. 같은 PR329 브랜치에서 기존 여행 기록 진입과 동일한 위치·폭·80px 높이에 뉴스 진입을 연결했다. 기존 여행 기록·사진·백업·복구 코드는 유지하고 뉴스 화면 하단에서 기존 `/travel-records`에 접근한다. 저장 자료를 삭제·이동·변환하지 않는다. 사용자 병합 PR331의 최신 main22ee4206을 로컬 통합했다.

`/[locale]/airport-news`는 4언어로 공항/관세 두 탭, 목록/상세, 원문 링크와 출처를 제공한다. 게시일·공식 수정일·근거 있는 시행일/마감일을 구분한다. 확인되지 않은 사실·날짜·첨부 내용은 만들어 표시하지 않는다. 인터페이스만 번역하고 원문 제목·사실·출처는 보존한다. deep link/back, 키보드/Escape 초점 복귀, reduced-motion, API 실패/재시도와 권한 철회 시 상세 제거를 검사했다.

홈페이지에는 자체 SVG 표식만 연결해 뉴스 목록/CSS 전체를 미리 가져오지 않는다. 뉴스 API 요청은 별도 뉴스 화면에 진입할 때만 발생한다. 외부 이미지·3D 엔진·새 폰트 요청이 없다. 파일 크기나 로컬 fixture 검사로 실제 운영 PSI/LCP 개선을 주장하지 않는다.

### 권리와 실제 첨부 검토

[관세청 정책](https://www.customs.go.kr/kcs/cm/cntnts/cntntsView.do?cntntsId=2610&mi=7421)과 [공공누리1유형](https://www.kogl.or.kr/info/licenseType1.do)에 따라 항목별 정확한 ID/제목/표시/이용허락·정상 원문·작성자를 확인한다. RSS 제공이나 기관 전체의 유형으로 재사용 권리를 추정하지 않는다.

실제 관세청10178583(원유 지원)·10178304(9월 수출입 잠정치)의 항목별1유형과 작성자 이준을 확인했다. 각 정상 공식 PDF/HWPX, 총4파일의 실제 bytes/SHA256를 검토했다. 무료 설치 도구로 PDF 전체7쪽과 HWPX 본문을 읽었다. 이미지 렌더 도구가 없는 이 환경에서 사진/도표는 검토 완료로 세거나 재사용하지 않는다. 검토 helper는 article ID·공식 첨부 URL·실제 binary SHA·확인한 본문과 정확한 사실 문구를 묶는다. 시행/효력·마감 역할과 실제 날짜 증거가 없으면 날짜는 null이다.

저장된 실제 RSS/정상 HTML/첨부 bytes → 검토 helper → **로컬 메모리 SQLite** → 저장 전용 API를 확인했다. 각 글 첫 저장 current1/revision0, 동일 재관측 current0/revision0, 첨부2개 검토 완료, 사실1개만 원문 그대로 확인. 두 글은 공항·면세 관련 자료가 아니므로 unclassified로 비공개 보존하며 시행일/마감일/수정일은 null, 매장 우선 false다. 결과 공개 API는 **MISSING/items0**이다. 무관한 글로 빈 탭을 채우지 않는다. 실제 운영 collector/원격 DB 쓰기는 실행하지 않았다.

관련 면세 공고10153830/10153585·행정예고10177543은 항목 권리 표시가 확인되지 않아 보류한다. 공항 상업 재사용/직접 링크 조건의 개별 승인과 법제처 정상 OC 신청·credential이 필요한 경로도 보류한다. 새 신청/계정/credential/외부 연락/유료 서비스를 사용하지 않았다.

### 보관·수집 경계

준비 SQL0026은 current최대200, 의미 변경 revision최대400, 항목 payload최대8KiB다. source+ID 기본키와 공개 조회 index를 사용한다. 같은 내용의 receivedAt/권리 확인 시각/첨부 검토 시각만 바뀌면 write0이다. 의미 변경에만 이전 payload를 revision으로 보존한다. 한 batch는 최대20건이며 DB trigger 용량 초과 시 전체가 실패한다. raw HTML/PDF/사진은 운영 DB에 저장하지 않는다. 용량 초과를 삭제·자동 compaction으로 해결하지 않으며 소유자의 별도 보관 결정이 필요하다. 상한 도달 시 변경/권한 갱신도 실패할 수 있으므로 운영 활성화 전에 용량 경고·fail-closed 제공 정책을 결정해야 한다.

Node 준비 collector는 4개 공식 피드·정상 목록(8회)과 최대20개 정상 글, 합계최대28요청, 응답각1MiB/15초·redirect거부·재시도0이다. 동일 ID 중복 수집을 제외하고 글의 권리 표시가 사라진 경우 이전 공개 자료를 depublish하는 변경을 보존한다. 첨부는 최대4MiB의 별도 실제 검토를 받아야 한다. collector는 첨부를 자동 다운로드/AI 처리하지 않는다.

`CUSTOMS_NEWS_COLLECTION_REVIEWED=false`이며 생산 CLI는 compile gate와 별도 runtime 조건이 열리기 전 config/credential/HTTP/DB 접근 없이 DORMANT다. 스케줄·workflow를 추가하지 않았으며 A1 복구 승인과 별개다.

GET API는 권리 확인된 공항/관세 저장 항목만 index로 최대50건 SELECT한다. collector/migration/원격 source 호출/write가 없다. 준비된 DB에 자료0이면 MISSING, binding/query 실패는 UNAVAILABLE로 구분한다. no-store 응답을 사용하며 자료·권리 검증을 다시 수행한다.

### 제한과 감사 증거

최대 canonical payload는200+400건×8KiB≈4.69MiB로 장기30/90/365/1095일에도 동일한 하드 상한이다. index·메타데이터·기존 DB 전체 usage는 별도 실측이 필요하다. 하루 사용자가 뉴스1회씩 열고 각 조회가50행까지 읽는다고 가정하면100/500/1000/5000/10000/20000사용자에서 각각100/500/1000/5000/10000/20000조회 및5000/25000/50000/250000/500000/1000000행 읽기 상한 추정이다. 이 수치는 공식 usage·실제 traffic capacity가 아니다. 실제 D1 index amplification/CPU/usage와 전체 사이트 예산·70/85/95 활성 guardrail·staging/production 증거는 수집 활성화 전 별도 확인해야 한다.

| 감사 항목 | 결과/근거 |
|---|---|
| 1–3 HEAD/분리/구조/중복 scheduler | 같은 PR329/main통합, Actions준비→D1→Worker읽기, 추가 schedule0 |
| 4–6 Worker CPU/Cron/요청 | CPU실측 BLOCKED; heavyCron N/A; 뉴스open마다 SELECT1/최대50, home뉴스요청0 |
| 7–9 일정/동시성/외부quota | schedule없음; atomicbatch/caps 검사; 28회 상한, 정상 제공자quota/활성 cadence BLOCKED |
| 10–14 write/index/hash/중복/경합 | 최대current20+revision20논리write/batch, 실제metadata확인; indexusage BLOCKED; 동일내용0·PK/atomic DB 검사 |
| 15–17 증거/장기보관/retention | private 연구 bytes만 보존; 운영raw0; canonical4.69MiB 하드상한; cap은 중단, 삭제없음 |
| 18–20 예측/Outcome/backfill | N/A, 해당 코드·truth변경없음 |
| 21–23 날짜/상태/실패 | KST게시·수정·시행·마감 분리, MISSING/UNAVAILABLE, timeout/429/크기초과 보존 검사 |
| 24–28 secret/read/usage/guardrail/paid | secret검사; indexLIMIT50; 공식usage/70/85/95뉴스활성 BLOCKED; paid/새credential0 |
| 29–30 migration/전체경로 | SQL로컬만 적용; remote미실행; 실제자료→로컬DB→API items0 및 UIfixture110 검사; production BLOCKED |

검증: 최종관련 unit35, 전체 로컬unit1344 및 PR331 main통합 후1349, typecheck/변경 파일lint/빈bindingNode build/secret scan 통과. 마지막 실제수집 요청상한·binding실패·href수정은 관련35와lint로 재검증했다. 실제 locale 페이지의110개 E2E가 통과했다(4언어×360/390/430/1280, 뉴스20, 기존 출국·header·소비·여행 기록/IDB/사진/백업/복원 보존). 보호된 UI Lock·폰트 fixture는 바꾸지 않았다. 글/권리 fixture는 테스트 파일에만 존재하고 공개 seed는 없다. 최신main 통합 후 정상 CI 결과는 PR 본문에 별도로 확인한다. 아래는 이전 준비 단계의 역사 기록이다.

## 이전 준비 기록

2026-10-10 확인. PR328과 분리된 `codex/airport-customs-news-20261010` 브랜치의 오프라인 준비 코드입니다. 기존 여행 기록 버튼·저장 자료·공개 사이트를 변경하지 않았습니다. 실제 피드 수집, 공개 재게시, 법령 API 호출, 자동 스케줄 및 배포를 실행하지 않았습니다.

| 출처 | 공식 확인 근거 | 현재 처리 |
|---|---|---|
| 인천공항 공지 RSS | https://www.airport.kr/bbs/co_ko/84/rssList.do?row=50 | 제공 사실만으로 재게시 허용을 추정하지 않음 |
| 인천공항 저작권 정책 | https://www.airport.kr/ap_ko/1033/subview.do | 수익 활용 사전 협의 및 세부 링크 제한이 있어 권한 확인 전 연결 보류 |
| 관세청 RSS 목록 | https://www.customs.go.kr/kcs/selectBoardRssList.do?mi=7424 | 보도1362·공고1364·보세판매장1365·행정예고1366 식별, 수집 미실행 |
| 관세청 저작권 정책 | https://www.customs.go.kr/kcs/cm/cntnts/cntntsView.do?cntntsId=2610&mi=7421 | 게시물별 공공누리 유형·가공 허용·상업 활용·필수 출처를 확인. 미표시 자료는 사전 협의 필요 |
| 법제처 행정규칙 데이터 | https://www.data.go.kr/data/15057542/openapi.do | 무료·활용신청 안내 확인, 신청 및 인증 확인 전 호출 보류 |
| 행정규칙 API 공식 가이드 | https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=admrulListGuide | OC에 신청한 인증값 필요. 테스트 인증값으로 접근하지 않음 |

준비된 순수 함수는 미분류·권한 미확인 자료와 정정 이력을 보존합니다. 항목별 공개 권한과 출처문구가 확인된 경우만 화면 후보로 삼습니다. 명시 근거 있는 시행일·마감일만 우선순위에 쓰고, 다른 자료는 실제 발표 시각으로 정렬합니다. 뉴스 제목에서 날짜를 추측하지 않습니다.

미연결 화면은 두 탭과 목록·상세 대화상자를 제공합니다. 확인된 사실·변경·대상·일정·원문·필수 출처문구를 표시합니다. 키보드 탭 이동, 기본 목록 선택 및 나중에 철회된 권한의 상세 제거를 준비했습니다. 유료 AI나 생성된 정책 내용을 사용하지 않습니다.

검증: 순수 로직5건·한국어 폰트 coverage2건·타입·수정 파일 lint 통과. 별도 로컬 테스트 화면에서한국어·영어·중국어·일본어×360/390/430/1280의16개 조합을 통과했습니다. 초기 목록·탭 키보드·Escape 후 초점 복귀·권한 철회·가로 넘침·콘솔과 실제 글리프의 누락을 검사했습니다. 관세 목록만 나중에 들어오는 경우에도 처음부터 그 목록을 선택합니다. 인터페이스 문구만 번역하고 기사 제목·사실·출처문구는 원문을 보존하며 기존 제공자 한국어 폰트 정책을 사용합니다. 이 검증에 사용한 자료와 날짜는 명시된 개발 fixture이며 실제 공지가 아닙니다.

공개 연결 전 남은 작업: 이용 조건 충족 증빙과 실제 초기 목록 확보, 허용된 제공자 adapter 및 보관 연결, 기존 여행 기록 접근 보존과 같은 크기의 진입 버튼, 실제 연동 브라우저 검증. 사용자 병합 후 최신 main70ec17577c7ff9fb4b4beffae21c647a9e05532e로 준비 브랜치를 맞췄습니다. 빈 목록 버튼을 공개하고 완료로 표시하지 않습니다.

2026-10-10 후속 검증: 공식 관세청 RSS1362/1364/1365/1366은 HTTP200이었다. RSS 링크만 있는 GET은 잘못된 요청 안내도 HTTP200으로 반환하므로 그것을 글·권리 성공으로 세지 않았다. 정상 공식 목록 버튼으로 연 글의 항목별 공공누리 표시를 확인했다. 10178583과10178304에는 실제 글 제목과 연결된1유형 표시가 있고, 공개된 nttSnUrl을 포함한 정상 GET에서도 같은 표시·글 식별자·제목을 다시 확인했다(13:01 UTC, 두 항목HTTP200). 반면 출국장 면세점10153830/10153585와 행정예고10177543에는 해당 표시가 없어 비공개 준비 상태로 유지한다. 기관 전체나 RSS 전체에1유형을 적용하지 않는다.

`lib/customs-news-adapter.ts`는 크기와 항목 수를 제한한 오프라인 파서다. 공식 RSS의 한국 현지 시각을KST로 명시해서 변환하며, 표준 HTML doctype 및 실제 응답의 인용부호 엔터티도 읽는다. 권리 표시는 해당 글 식별자·정확한 제목·1유형 그림과 공식 이용허락 주소가 모두 맞아야 한다. 정상 원문 링크 확인을 별도로 받아야 공개 후보가 된다. 출처·연도·제목·원문·이용허락을 표시하고, 시행일·마감일·매장 관련성이나 첨부 내용을 만들어 채우지 않는다. 실제 확인한 두 글도 매장 우선 자료로 승격하지 않았고 첨부 검토가 남는다.

후속 어댑터 검증: 새4개 테스트를 포함한 뉴스·권리·폰트11개, 타입 검사·해당 파일 lint 통과. 실제 증거는 작업 폴더 outputs/news-preparation-20261010/customs-rights/adapter-validation.json에 있다. 이 초안은 여전히 홈페이지에 연결되지 않았고 실제 보관·정기 수집·완성된 첫 화면 목록이 아니다. 공항 글의 상업 재사용/직접 링크 조건, 법제처 정상 신청 및 실제 자료 검토가 남아 있다.
