# 신라 환율 한 줄 배치와 작은 모바일 설치 버튼

사용자가 병합한 PR315의 최신 main `7143ef7d475f8578ba466686266259f242026451`을 정상 merge한 후속 브랜치다. 직접 병합·배포는 하지 않는다.

사용자가 “1usd = 의 =가 너무 짧아서 뭔가 잘린듯해.. 가로에 한눈에 들어오게못할까?
앱처럼설치 버튼크기는 줄여도돼 더작게 그리고 공간을확보해”라고 요청했다.
부모 스레드가 전달한 제약은 터치 영역/접근성 유지, 전체 폰트 변경 금지, 보호 기준 우회 금지다.

변경은 숫자의 `display:block` 줄바꿈을 없애고 환율 공간을 146px basis/124px 최소로 확보한다.
등호는 별도 inline 요소로 자연 글꼴과 크기를 그대로 쓰며 축소 transform/overflow clipping을 쓰지 않는다.
한국어는 `1 USD = [API 값]원`, 나머지 언어는 기존 KRW 단위다. 환율은 하드코딩하지 않았다.

모바일 설치 버튼의 표시 문구만 “앱 설치”/“Install”/“安装”/“追加”로 줄인다.
전체 원래 문구는 aria-label과 desktop 표시로 유지한다. 외곽 터치 영역은 최소 44×44px,
작은 안쪽 표시 테두리는 24px 높이다. 원래 설치/포커스/모달/키보드 동작은 유지한다.
전역 폰트 정의와 다른 화면의 글자 크기/레이아웃은 바꾸지 않았다.

## 검증된 실제 로컬 렌더

아래는 로컬 API fixture의 실제 Chromium 캡처다. 생산 자동 수집 성공을 뜻하지 않는다.

![360px 한 줄 환율](assets/duty-free-header-inline-360.png)
![390px 한 줄 환율](assets/duty-free-header-inline-390.png)

ko/en/zh/ja × 360/390/430/1280px와 기존 자정·재조회·네트워크/저장소 실패 등
옛 두 업체 캐시 응답을 포함한 환율 화면 27개 검사가 모두 통과했다. 등호 min-width/transform 없음, 실제 Range rect의 한 줄,
언어 선택과 겹침 없음, 터치 크기, glyph/overflow, 키보드/설치를 검증한다.
typecheck, 전체 lint(오류 0/기존 경고 7), production build와 rendered HTML 46개가 통과했다. 최종 CI 결과는 PR에 기록한다.

첨부 `libfile_4e4bd9a903448191a40a3626b37fbc88`은 공식 Library materialize에서
HTTP 403으로 파일을 받지 못했다. Library image read도 픽셀 대신 포인터/설명만 반환했다.
첨부의 픽셀을 봤다고 주장하지 않는다. 위 새 캡처의 실제 픽셀은 직접 검토했다.

## 소유자 승인과 보호 기준

부모 스레드 01a0fd0d-cf77-70ee-b6c3-0d341a4930ec가 전달한
Sentinel_db704c3429e881918aa0a05ef864f295의 소유자 답변은
“신세계는버리고 신라만가져와 구리고 디자인 검사기준 승인해”다.
작은 설치 버튼/한 줄 환율의 두 보호 파일에 대한 정상 기준 갱신을 승인한 답변이다.

fixture의 ownerApprovedShillaOnlyInlineHeader20261008에 근거와 실제 SHA-256을 기록했다.
app/globals.css와 app/install-app.tsx 두 hash만 갱신했다. 다른 59개 hash,
61개 파일 목록, 과거 승인 기록, cron 및 원본 enforcement assertion은 그대로 유지한다.
원본 보호 검사와 저장 분류·환율 검사 73개 및 전체 단위 검사 1,239개가 모두 통과했다. 검사 끄기/skip/retry 변경은 없다.

## 신라 단일 수집·공개 경로

신세계는 자동 collector 기본 대상, 공개 API 조회 및 화면 목록에서 제외한다.
명시적으로 신세계를 collector에 전달해도 DB나 제공자 요청 전에 거부한다.
기존 신세계 CURRENT/attempt 행과 과거 관측 파일은 삭제하지 않는다.
실제 SQLite 검사에서 행 전체가 변경 없이 보존됨을 확인한다.
기존 두 업체 API 캐시가 남아 있어도 UI는 신라만 선택하며 신세계 실패로 신라 값을 감추지 않는다.

신라의 공식 selector 검증, 1시간/차단 24시간 guard, 중복 lease, 동일 값 write 0,
실제 확인 UTC/KST, 이전값과 실패 표시, 자정 갱신 및 공유 cache 정책은 유지한다.
최종 PR의 전체 CI 성공 및 draft=false/mergeable 상태를 확인한 뒤 멈춘다. 직접 병합·배포하지 않는다.
