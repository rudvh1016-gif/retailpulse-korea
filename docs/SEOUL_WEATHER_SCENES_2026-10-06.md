# 서울 관측·예보의 Blender 표시 — 2026-10-06

서울 네 지역의 기존 관측 카드와 날씨 행에 관광안내 PR291의 WeatherScene을 연결한다. 실제 수치·짧은 검정 제목·출처·업데이트 시각을 HTML에 유지하고, 안내와 오래된 관측의 설명은 네이티브 details로 펼친다. 그림은 준비 화면 PR290에서 실제 Blender로 만든 빈 온도계 모형을 그대로 재사용한다. 새로운 렌더·자료 조회·METAR 연결·의존성은 없다.

## 기준과 파일 조율

- 실제 fetch한 main: `1b5fdd5b8ca1351d8fceb3ed71d4e5298a686bdd`. PR289의 출국장 대기·PC 월 누적 변경이 포함됐다.
- 공통 컴포넌트는 PR291에 있으므로 그 관광안내 브랜치 위에 후속 변경을 만들었다. PR291 병합 후 main으로 순서대로 인계한다.
- 공항 PR284와 PR288의 실제 diff를 확인했다. 대상인 `app/live-signals.tsx`, `app/operational-context.tsx`는 해당 PR에 포함되지 않는다. 공항 설명·출국준비·서울 예측 차트·여행기록을 편집하지 않았다.
- 보호 파일은 위 두 개뿐이다. phase2-locks.json에서 두 SHA256만 정상 갱신했으며 다른 해시·승인 기록·cron·검사 구현은 유지한다.
- live-signals: `eaf2709b09abd8b88996aea680ae07df1745277f04849407e9d4ebd1aae45509` → `4ec8d0f0783ca0be92b5e4c4d706d9da28c9be6cd95c50fd7294bf8ee30a25aa`.
- operational-context: `6613999313746e4118e44dc8e843b276eb6f2b6ec76615a9e57a8361cd5a1f83` → `a2a0da4db16caaafb2967517fa4cb9da4e65938b82699999fc90e0c491dc4a40`.
- PR267/276/278 변경을 가져오거나 다른 PR로 포함하지 않는다.

## 자료와 표시

SeoulContextCard의 기존 서울시 관측 기온·습도·풍속·PM10/PM2.5·등급을 그대로 표시한다. 기존 describeObservationAge가 정한 지금/실제 과거 시각과 관측-예보 시간 차 설명을 유지한다. 기상청 예보는 원래 표시한 다음 12행의 날씨·기온·최대 강수확률·최저/최고·강수량을 유지한다. 최신 서울 관측이 있으면 예보 습도·풍속을 숨기는 기존 규칙도 유지한다.

기존 날씨 행은 POP가 모두 누락돼도 null을 0으로 치환하여 0%라고 표시했다. 실제 발표된 POP가 있는 경우에만 최대값을 표시하도록 수정했다. 발표된 0%는 0%이며, 누락값과 구분한다. 온도·날씨 등 기존 표시 자료와 기존 안내가 모두 없으면 행과 모형을 만들지 않는다. 기존 guide helper를 변경하지 않았으며, 수치 없이 PTY 코드만 있는 자료의 기존 안내 누락 규칙도 유지한다.

각 관측/예보 묶음은 모형을 한 번만 보여준다. 관측 수치가 있으면 그 카드에서 보여주고 아래 예보는 짧은 수치와 시각으로 제공한다. 관측 수치가 없으면 예보 행에서 모형을 보여준다. 실제 발표 시각은 중복 없이 출처 옆에 보이며 실제 대상 시각·안내는 펼칠 수 있다. 모형은 현재 비·눈·풍속·난기류 상태를 주장하지 않는다.

기존 글꼴·weight 토큰을 유지했다. 관측 주요 글자는 기존 15px, 예보 수치는 기존 데스크톱 16px/모바일 15px을 유지한다. 모형은 기존 WebP srcset·lazy·async·크기 예약과 빈 장식 alt를 사용한다. 설명은 키보드 조작·포커스·최소 44px 영역을 갖춘 details다.

## 검증

- 새 날씨 E2E 17개: 한국어/영어/중국어/일본어 × 320/390/430px, 원래 관측/예보 수치, 최신 관측의 중복 습도·바람 제거, 오래된 관측의 정확한 시간 차, 발표 0%/누락 POP 구분, 전체 누락, PTY만 있는 경우, 한 묶음 한 모형, 검정 제목, 기존 15px, 키보드·포커스·44px, 이미지 decode·lazy·글리프·넘침·page error.
- 관광 회귀 8개와 기존 typography 3개를 포함해 관련 E2E 28개 PASS. 최초 PTY 사례는 새 테스트가 기존 helper의 수치 선행 조건을 잘못 기대해 실패했다. 기존 규칙을 확인한 뒤 테스트 기대만 수정해 PASS; 앱 판정은 변경하지 않았다.
- weather guide/enrichment/observation freshness/operational clarity/Owner UI Lock unit 94/94 PASS.
- 타입 PASS, 전체 ESLint 오류 0 / 기존 경고 7.
- 공식 UTF-8 bounded build PASS, rendered HTML 42/42 PASS.
- 공식 secret scan: 현재 작업트리와 접근 가능한 Git 이력 PASS. 최종 커밋과 문서의 증분 검사 결과는 PR 본문에 기록한다.
- 실제 공개 summary generatedAt `2026-10-06T09:27:06.677Z`를 로컬 검토 스냅샷으로 사용했다. 명동 관측 21.1°C·40%·3.5m/s·PM10 18/PM2.5 9 μg/m³·18:20 KST와 별도의 예보 19°C·최대 20%·17:00 KST를 그대로 표시했다. 제품 상수나 현재 실시간 주장으로 넣지 않았다.
- 네 지역 390px 및 명동 320/430px의 관측/예보 PNG 12개를 실제 화면에서 캡처해 수치·출처·시각·가독성·넘침 없음·page error 없음을 확인했다.
- 물리 휴대전화·Safari·공개 배포는 미검증이다. 병합·배포는 주 담당이 순서대로 수행한다.

## Library PNG

검토 PNG 12개는 [screenshots/seoul-weather-20261006](screenshots/seoul-weather-20261006)에 있다. 앞선 공식 helper 검색의 prepare_uploads 미제공과 사용자 추가 지시를 확인한 뒤 현재 Library skill의 prepared tools unavailable / all creates 공식 대체 절차로 한 배치 저장했다. 아래 전부 create status=succeeded, image/png, version 0이다. 권한 거절을 우회한 호출이 아니다.

각 원본에 공식 metadata helper를 호출했으나 Windows의 `AttributeError: module 'os' has no attribute 'setxattr'`로 로컬 메타데이터 적용 12개는 실패했다. Library 저장 12개는 성공했으며 반환 ID·file_id·이름·버전·원본 경로는 작업 환경의 weather-library-identities.json에 보존했다. 다시 업로드하지 않았다.

- KORETAIL-seoul-myeongdong-observed-320.png: `libfile_f9f950db6cdc81919ddb98dda7cc1a75` (version 0, 16306 bytes)
- KORETAIL-seoul-myeongdong-forecast-320.png: `libfile_57464c5e5e0081919dc06dcb2366e73c` (version 0, 10854 bytes)
- KORETAIL-seoul-myeongdong-observed-390.png: `libfile_8ede736af028819187ea1ce8a09323be` (version 0, 16460 bytes)
- KORETAIL-seoul-myeongdong-forecast-390.png: `libfile_2cda4a7df66081919b74cdba9801811c` (version 0, 11055 bytes)
- KORETAIL-seoul-myeongdong-observed-430.png: `libfile_c5598b51dc10819192ebbc83df87bdf8` (version 0, 16587 bytes)
- KORETAIL-seoul-myeongdong-forecast-430.png: `libfile_2962e3997de08191b233d13a5c44073d` (version 0, 10892 bytes)
- KORETAIL-seoul-hongdae-observed-390.png: `libfile_6394a7fa12188191b5f50fb3b652faf6` (version 0, 16372 bytes)
- KORETAIL-seoul-hongdae-forecast-390.png: `libfile_c232f47d6b58819198b8a5603ea55747` (version 0, 11055 bytes)
- KORETAIL-seoul-seongsu-observed-390.png: `libfile_e6774741db708191a873bbe801688c15` (version 0, 16399 bytes)
- KORETAIL-seoul-seongsu-forecast-390.png: `libfile_ceca5a16648081918ecb7ef79a4876eb` (version 0, 11055 bytes)
- KORETAIL-seoul-itaewon-observed-390.png: `libfile_62387ef327bc819189b8a5799c12b07e` (version 0, 16441 bytes)
- KORETAIL-seoul-itaewon-forecast-390.png: `libfile_c1c1bc0786608191b7e1d6b32758693a` (version 0, 11055 bytes)
