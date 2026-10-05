# 공항 설명과 국가 비교 정리 — 2026-10-05

검토 기준 main: `28390c5794f9f753025487e1ecf9ff60c64de5c4`.
브랜치: `fix/airport-header-copy-trim`. Library의 IMG_0914.jpeg, IMG_0915.png,
IMG_0916.png를 작업 컴퓨터에 materialize하고 픽셀을 직접 확인했다.

## 변경

- 인천공항 제목 아래의 긴 소개와 오늘 피크 문장 렌더링만 제거했다.
  제목, 출국 준비·공항 흐름 진입점, 데이터 수집, 홈의 오늘 답변은 유지했다.
- 참고값 배분 설명과 국가 집계 설명을 기본 닫힘 `주의사항` 하나로 모았다.
  참고값 제목·숫자와 국가 목록은 접기 밖에 있다. 확인 불가·시간 범위 상태 및
  하루 전체로 복귀하는 동작은 그대로 표시한다.
- 서편·중앙·동편을 세 열로 나란히 배치했다. 모바일은 이 비교 영역만 가로로
  넘기며, 구역 이름과 넘김 안내를 표시한다. 위치 미확인은 아래 별도 행이다.
- 기존 글자 크기·검정색 국가명과 숫자·국기·편수·비율·전체 국가 보기·동률·0을
  유지했다. 키보드로 접기와 비교 영역에 접근할 수 있다. 애니메이션은 추가하지 않았다.

## 계산 근거 검토

`lib/airport-flight-split.ts`, `lib/airport-flight-split-copy.ts`,
`lib/airport-top-reference.ts`, `lib/airport-zone-countries.ts`,
`lib/airport-zone-share-copy.ts`의 기존 계산과 설명을 검토했다. 이 파일들의 계산은
수정하지 않았다. 승객 참고값은 같은 범위의 공식 예상 출국객을 편수에 비례해
배분하며 편당 승객 수가 같다는 가정과 백 명 단위 반올림을 명시한다.
T1의 탑승동 포함 가정, T1·T2의 독립 계산, 실제 사용한 분모와 제외 건수도
주의사항 안에 보존했다. 국가 비중의 분모는 목적지 미확인 항공편을 포함한
해당 구역 전체 편수다. 구역 비중은 위치 미확인을 포함한 선택 전체 편수다.
상위 세 항목과 세 번째 항목의 모든 동률을 표시하고 나머지 국가를 펼쳐 볼 수 있다.
국가·비중이 승객 국적이나 사람 수를 뜻하지 않는다는 설명을 유지했다.

## 검증

- 전체 lint: 오류 0, 기존 이미지 경고 6. TypeScript: 통과.
- `vinext build`: 통과. `node --test tests/rendered-html.test.mjs`: 42/42 통과.
- 전체 단위검사: 1,150 통과 / 1 실패. 실패는 아래 Owner UI Lock 해시 차이 한 건이다.
  Windows 체크아웃의 CRLF는 로컬에서 LF로 정규화했고 기준 fixture는 변경하지 않았다.
- 관련 Playwright 72/72 통과: airport-overview, airport-destination-flags,
  airport-country-glyphs, airport-zone-shares, airport-model-placement,
  airport-v5-scopes, passenger-guide-blender. 320/390/430px, 데스크톱,
  네 언어, Enter·Space·연속 클릭, 비교 영역의 키보드 가로 스크롤,
  전체 국가, 공동 순위, 0·미확인, 터미널 전환과 기존 Blender 가이드를 확인했다.
- 비밀정보 검사: 작업 트리와 reachable Git 이력 통과.
- health: HARNESS EXECUTION PASS / SYSTEM VERDICT UNKNOWN. 운영 데이터 검증이나
  배포 성공을 뜻하지 않는다. 새 API·수집·스케줄·계정·유료 의존성 변경 없음.
- 로컬 디자인 지침과 React 접근성 검토 완료. native details, 고유한 접근성 ID,
  비교 영역에 한정된 overflow, 기존 폰트 크기와 데이터 의미를 확인했다.

## 화면 증거

아래 이미지는 2026-08-31 **고정 테스트 데이터**를 넣은 로컬 미리보기이며 실제 운영
수치나 공개 배포의 증거가 아니다. 390px와 1280px에서 페이지 전체의 가로 넘침은 없었다.

- [상단 390px](evidence/airport-copy-2026-10-05/airport-header-390.png)
- [국가 비교 390px](evidence/airport-copy-2026-10-05/airport-comparison-390.png)
- [국가 비교 1280px](evidence/airport-copy-2026-10-05/airport-comparison-1280.png)
- [주의사항 펼침 390px](evidence/airport-copy-2026-10-05/airport-notes-390.png)

## 남은 차단과 인계

보호 파일 `app/retailpulse-app.tsx`에서 상단 두 문단과 불필요해진 AirportView의
todayAnswer prop만 제거했다. 홈의 todayAnswer 사용은 유지한다.

- 현재 승인 해시: `2ed6669aec005dc9bef2ab6d6f2aa8aa61400becffdb2bde0f4bf349912551c5`
- 검토할 새 해시: `d5c55377d695c98cb4a10444a7f3cc33b649a1d521eb59ad9f181c0d784089a5`
- `tests/fixtures/phase2-locks.json`은 변경하지 않았다. 다른 보호 파일의 해시는 모두 일치한다.
- 이 변경에 대한 명시적 승인 후에만 해당 해시와 사유 기록을 갱신할 수 있다.
  그 후 정상 전체 CI와 배포 후 공개 화면 검증이 필요하다. 현재 draft 상태로 보존한다.

PR276(`a765a00f438800889a316eb3d18548236f3008e8`)은 OPEN이고 main에 들어오지 않았다.
해당 PR도 AirportView와 일부 같은 E2E를 변경하므로 어느 쪽이 먼저 병합되든 최신 main에서
제목·문단 중복과 승객/직원 화면을 다시 검증해야 한다. 이 브랜치에 PR276을 가져오지 않았다.
PR266/267/274/276의 병합 거절을 재시도하거나 우회하지 않았다.
이 작업의 병합·공개 배포는 수행하지 않았으며 CI 상태와 커밋 SHA는 PR 본문에 기록한다.
