# 성수 과거 날짜 관측 조회 수정 · 2026-10-09

2026-10-08 성수 화면은 보유 관측이 있는데도 자료 없음과 빈 인구를 표시했습니다. 09:52 KST 확인한 [날짜별 요약](https://koretaildata.com/api/live/summary?date=2026-10-08)은 날짜를 올바르게 반환하지만 성수 realtime=null, observedSeries=[]였습니다. 캐시는 EXPIRED였습니다. 반면 [월별 보유 기록](https://koretaildata.com/api/live/summary?view=records&area=seongsu&month=2026-10)은 그날 24시간 COMPLETE, SEOUL_CITYDATA_PPLTN / POI068 / LIVE / VALID 기록을 반환했습니다. 월별 값은 시간별 표본 정의에 따른 평균 범위이며 일 방문객 수가 아닙니다.

확인한 최신 main은 f3ca0434a2a7b9c1aa87c330da3aacf864ddb7d0입니다. 요약 API는 과거 realtime을 null 처리하고 관측 시계열 SQL도 TODAY만 허용했습니다. 저장 자료를 읽을 경로가 없어 생긴 문제입니다. 현재 혼잡도와 과거 날짜를 구분하며 현재 값을 어제 값으로 옮기거나 재수집하지 않습니다.

app/api/live/summary/route.ts 하나를 수정했습니다. 과거 날짜는 선택한 KST 날짜의 [00:00, 다음날 00:00) 범위에서 마지막 유효 원본 관측과 시계열을 반환합니다. 오늘은 기존 최근 6시간, 미래는 관측 없음입니다. 최소·최대 범위, 0, 미보유, 관측·수집 시각과 출처·품질·스키마 구분을 유지합니다. 전주 같은 시간 비교는 기존 baseline 조회를 선택한 관측 시각에 연결하며 미보유 비교·예상값을 만들지 않습니다. 과거 화면의 앞으로 예상 없음은 현재 예상으로 채우지 않습니다.

D1 일괄 읽기 1회와 인덱스를 유지합니다. 과거 요청에는 지역당 하루 최대 289개 원본 5분 표본의 명시적 상한을 둡니다. 보간·합계·누락값 0 변환은 없습니다. 실제 청구 행수/CPU는 로컬 query plan으로 확정하지 않습니다. provider 요청·수집·삭제·스케줄·키 변경 0입니다.

검증: SQLite 실제 스키마 회귀 12개 PASS, native tsc --noEmit PASS, 해당 파일 ESLint PASS, 전체 Worker 빌드 PASS. 회귀는 과거 유효 관측/배타적 자정 경계/0/잘못된 출처·품질 제외/전주 같은 시각/오늘 유지/미보유·미래/인덱스와 1회 일괄 읽기를 확인했습니다. 처음 기본 Node는 TS 로더가 없고 npm typecheck는 native bash가 없어 실행되지 않았습니다. 정식 tsx 로더와 직접 tsc로 검증했습니다.

원래 Owner UI Lock을 실행했으며 해당 API 해시 1개가 기존 승인 기준과 불일치했습니다. 보호 파일 61개 중 다른 60개, 모든 cron과 원래 검사를 유지합니다. tests/fixtures/phase2-locks.json은 SHA256 6cca131bf61bad933a28e6ca8e6b18f99500cf92b2c1fe30504a2ec6f27c1f7d로 변경하지 않았습니다.

정상 승인 대상은 해당 API 기준 해시와 기존 fixture 승인 기록 한 항목뿐입니다. b450bb04e4adb3bd388ebf5c29dc5fbf9d8a4cd0d8cb8a573b04f3710d6b34f8 → 147b9c17727c1041e424fe89e9305878c8a9d794e7c531a36c49f81ae24b99b1 변경이 준비됐습니다. 아직 기준 갱신·공개 병합·배포는 실행하지 않았습니다.

오늘 공항 590편 복구는 유지합니다. PR320의 최종 CI 37863623449는 전체 E2E 993개 SUCCESS이고 검토 가능 상태입니다. 이 수정은 PR320과 별도이며 마지막 Merge는 사용자가 진행합니다.
모바일·데스크톱 회귀 fixture 검토: 360/390/430/1280 × 4언어 16개 PASS, 빠른 날짜 왕복, 없는 날짜는 —, 키보드 상세 열기, reduced-motion, 콘솔/페이지 오류 0을 확인했습니다. 이는 과거 응답 형태의 회귀 fixture이며 아직 수정된 공개 화면의 실자료 검증은 아닙니다. 로컬 서버 종료 상태와 새 검사 선택자 오류를 바로잡아 실제로 실행했습니다.
