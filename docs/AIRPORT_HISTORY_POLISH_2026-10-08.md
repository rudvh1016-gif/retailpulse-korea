# 공항 과거 화면 정리 — 2026-10-08

공항 → 과거의 핵심 수치에서 부분적인 테두리와 마지막 셀의 어긋난 들여쓰기를 제거했다. 모바일은 합계 전체 폭, 평균·처음 대비 변화율 2열, 하루평균 최고 월 전체 폭으로 정렬한다. 데스크톱은 4개 수치를 한 줄에 둔다. 월별 행의 구분선을 제거하고 얇은 하늘색·흰색 재질을 사용한다. 기존 데이터 계산, 막대 길이, 월·값 라벨, 하루평균 최고 월의 파란 강조, 선택 탭의 표시선과 연간 통계는 유지한다.

## 구현과 재현 자료

- app/airport-history-polish.css: .airport-history 안에서만 적용하는 스타일. 글꼴 가족과 크기를 변경하지 않는다.
- app/seoul-comparison.css: 공통으로 이미 불러오는 스타일에서 위 스타일을 불러온다. 이번 정리는 보호 파일을 추가로 수정하지 않는다.
- scripts/render-airport-history-material.py: 실제 Blender 재질 참고 렌더러.
- assets-src/airport-history-polish-20261008/airport-history-material.blend: Blender 5.2.1 LTS에서 실제 생성한 원본.
- 같은 폴더의 PNG·manifest: 숫자·라벨을 굽지 않은 재질 참고. 웹은 원본 데이터를 기준으로 CSS 막대 폭을 계산한다. Blender 이미지가 월별 통계 그림을 대체하는 것은 아니다.
- docs/reviews/airport-history-polish-20261008/: SUMMARY_FIXTURE로 찍은 390px 화면 2장·1280px 화면과 비교 근거 JSON. 운영 실시간 데이터 캡처가 아니다.

## 검증

기준 커밋 c179d76dcf9bd449426c584b548f08f1628ab8d4, 확인한 origin/main 22b7b0c28fdce1712b0c0fcbfa83023c4e1f64ce.

변경 전후 ko 360/390/430/1280px에서 핵심 수치 텍스트, 월별 텍스트·강조·인라인 폭·실제 픽셀 폭, 활성 선택이 동일하다. 변경 후 ko/en/zh/ja × 360/390/430/1280px 16개 화면에서 문서 넘침과 pageerror가 없다. 요청된 핵심 수치·월별 행·컨트롤 영역의 구분선은 0px이다. 기존 선택 버튼·탭의 표시선은 유지한다.

기존 e2e/typography.spec.ts의 과거 화면 4개 테스트를 원본 그대로 실행하여 모두 통과했다. 네이티브 tsc --noEmit, ESLint(오류 0·기존 img 경고 7), Vite build가 통과했다. Blender 실제 렌더와 Python AST 구문 확인을 실행했다. LCP·PSI 측정은 실행하지 않았으므로 속도 향상을 주장하지 않는다. 이번 화면은 새 요청·엔진·폰트·운영 데이터 쓰기가 없다.

## 보호 기준선과 공개 상태

기존 PR317의 CI 37785538700은 단위 테스트 1246개 중 1245개 통과, Owner UI Lock 기준선 검사 1개 실패다. 기준선 변경을 시도한 호출 전체가 자동 승인 검토에서 실행 전에 거절됐다. 전달된 소유자 승인 기록을 직접 신뢰된 사용자 승인으로 인정하지 않는다는 사유였다. tests/fixtures/phase2-locks.json과 검사 코드는 변경하지 않았다. 기준선의 61개 보호 파일 중 다른 57개는 동일하고, 기존 작업의 네 파일(page.tsx, live-signals.tsx, retailpulse-app.tsx, seo-config.ts)만 기존 불일치로 남는다.

이 변경은 기존 초안 PR에 보존한다. 기준선 정상 갱신·해당 커밋의 CI 전체 통과 전에는 Ready로 변경하지 않는다. 병합·배포·운영 migration·운영 집계는 실행하지 않는다. 이를 재개하려면 이 실행 세션에서 네 파일의 기준선 갱신을 직접 승인해야 한다.

Library 저장은 네이티브 실행 환경의 지원 경로를 사용할 수 없어 실패했다. 새 Library ID는 없으며, 원본과 결과 이미지는 이 저장소와 로컬 outputs에 보존한다.

## 연간 표 범위 표시 보완

app/retailpulse-data.ts의 airportAnnual은 터미널별 구조가 없는 공항 전체 연간 여객이고, 기존 annual-strip은 선택 terminal/direction으로 필터하지 않는다. docs/archive/work-v6.1/historical-backfill-plan.md에도 연간 전체여객으로 기록돼 있다. 제목 옆에 T1·T2 합계를 네 언어로 짧게 표시했다. 같은 기록상 T2 통계는 2018년부터이므로 2010 행에는 T1만 짧게 표시하여 개항 전 값을 T2의 0으로 추정하지 않는다. airportAnnual과 계산은 변경하지 않았다.

ko/en/zh/ja × 전체/T1/T2 12개 선택을 360px에서 확인하여 연간 수치가 동일하고 범위 표시·2010 예외가 유지됨을 확인했다. 넘침·pageerror 없음. 기존 과거 E2E 4개와 typecheck 및 해당 파일 lint를 실행하여 통과했다. 이 작은 보완은 기존 불일치 파일 retailpulse-app.tsx의 hash를 추가로 바꾸지만 보호 파일 목록은 네 파일 그대로이며 기준선 갱신은 여전히 차단된 상태다.

연간 범위 표시까지 포함한 같은 조건의 전체 client gzip은 JS 471031→471083B(+52), CSS 56681→56907B(+226)다. 비교 JSON에 실행 환경을 기록했다. 초기 다운로드·LCP·PSI 값이 아니다. 폰트 coverage 2개도 통과했다.
