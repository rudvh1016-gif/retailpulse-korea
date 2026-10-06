# 관광안내 Blender 장면과 기존 날씨 표시 — 2026-10-06

명동·홍대·성수·이태원의 오늘 근무 브리핑에서 기존 지역 공간 모형과 실제 Blender 준비 모형을 표시한다. 긴 근거는 HTML details로 펼치며, 행사 설명도 처음부터 접힌 원문으로 제공한다. 제목·숫자·공식 행사명·기간·주소·거리·출처·링크·복사 동작은 HTML에 남긴다.

## 범위와 기준

- 기준: 준비 화면 PR290 head `54f05994e663e0c40f88d70f8f273273ffe1bc90`. 공통 SignalScene과 기존 준비 모형을 재사용하는 후속 관광안내 PR이다.
- 최신 main 확인: `1b5fdd5b8ca1351d8fceb3ed71d4e5298a686bdd` (PR289 출국장 대기·PC 월 누적, PR285 예측 자료 접기, PR290 준비 모형 병합). 추가 커밋의 파일과 diff를 확인했다. 이 main으로 관광안내 커밋을 rebase해 후속 관광안내 변경만 별도 PR에 포함한다.
- 변경 보호 파일: `app/tourism-desk.tsx` 한 개. 변경 전 SHA256 `7bc8f2376311b8ea2ea53a7ccd42d37ddf928087a7ba4b2e230b68a064ff33e3`, 변경 후 `736989465c5e51b7dd5a43d2b753826b2c3e09c5577e3a637a79d324683caa16`.
- `tests/fixtures/phase2-locks.json`에서 해당 SHA256 한 항목만 정상 갱신했다. 다른 보호 해시·cron·검사 구현은 유지한다.
- 공항·서울 예측 차트·여행기록·수집/API·METAR·스케줄러·D1·의존성은 이 변경에 포함하지 않는다. 거절된 PR267/276/278의 변경을 가져오지 않았다.
- `app/live-signals.tsx`, `app/operational-context.tsx`는 편집하지 않았다. 공통 날씨 표시의 후속 연결은 주 담당과 조율한다.

## 표시와 자료의 의미

`WeatherScene`은 입력받은 기존 WeatherGuideInput과 기존 formatWeatherDetails만 표시하는 컴포넌트다. 별도 조회·새로운 판단·새 날씨 자료·공항 관측을 추가하지 않는다. 예보 값과 서울시 대기 관측 PM10/PM2.5를 구분하고, 기존 출처·실제 발표 시각·예보 대상 시각·관측 시각을 글자로 읽을 수 있게 한다. 날짜는 KST로 표기하며, 값이 없는 자료를 만들어 넣지 않는다.

Blender 온도계는 빈 측정 기구 모형이다. 비·눈·풍속·난기류 등 현재 상황을 그림으로 주장하지 않는다. 예보 강수확률 0%는 그대로 0%다. 원래 브리핑에 날씨 행이 없으면 날씨 모형도 표시하지 않는다. 행사 무대 역시 실제 행사장이나 관객 수를 재현했다고 주장하지 않는 일반 안내 모형이다.

원본 지역 모형 4개와 기존 crowd/event/temperature 모형을 재사용했다. 새로 만든 장면은 중립적인 지하철 개찰구·카드 리더·빈 안내판 한 개뿐이다. 특정 역명·노선·승객 수·시각·운행 여부는 픽셀에 넣지 않았다. Blender 5.2.1 LTS, Cycles 48 samples, AgX, 투명 배경. 새 WebP는 320×240 및 640×480, 합계 18,866 bytes (5,796 / 13,070 bytes). manifest에 경로·크기·SHA256을 기록했다. 원본 .blend와 재현 스크립트는 [tourism-transit-v1-blender.zip](assets/tourism-transit-v1-blender.zip)에 있다.

기존 글꼴·type/weight 토큰을 유지했다. 기존 주요 브리핑 글자 14px도 유지했고, 제목·실제 수치는 검정이다. 이미지에는 srcset, 크기 예약, lazy, async와 빈 alt를 사용한다. 장식 모형은 보조기술에서 중복 읽지 않는다. 설명은 네이티브 details로 키보드와 44px 클릭 영역을 제공한다.

## 실제 검증

- 실제 공개 summary를 읽은 기준시각: `2026-10-06T09:27:06.677Z`. 로컬 검토에만 사용한 스냅샷이며 제품 상수나 최신 실시간 주장으로 넣지 않았다.
- 명동 실제 검토 값: 기온 19°C, 습도 55%, 바람 2.1m/s, 다음 12개 예보 행의 최대 강수확률 20%, 발표 10월 6일 17:00 KST. 관측 PM10 18 / PM2.5 9 μg/m³, 관측 18:20 KST. 기존 준비 화면의 선택 영업시간 강수확률 0%와 대상 구간이 다르므로 수치를 억지로 같게 만들지 않았다.
- 실제 스냅샷으로 4개 지역 390px 및 명동 320/430px을 캡처했다. 실제 수치·원문·공식 행사 기간·주소·출처·관측 시각·모형 로딩·넘침 없음·page error 없음 확인.
- 새 E2E `e2e/tourism-scenes.spec.ts`: 8/8 PASS. 4개 지역/언어, 320/390/430px, 키보드 설명 펼침, 예보와 관측 구분, 이미지 decode, 글리프, 공식 행사 기간, 0%, 자료 누락. 첫 실행의 실패 5개는 sparse fixture와 기존 행사 3개에 대한 테스트 기대 오류였으며, 기대만 수정 후 8개 PASS. 앱의 기존 데이터 판단 규칙은 바꾸지 않았다.
- `node --experimental-sqlite --import tsx --test tests/tourism-desk.test.mjs tests/tourism-routing-seo.test.mjs tests/tourism-visitor-show.test.mjs tests/weather-guide.test.mjs tests/weather-enrichment.test.mjs tests/operational-phase2.test.mjs`: 100/100 PASS.
- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- 전체 ESLint: 오류 0, 기존 경고 7.
- UTF-8 Git Bash `scripts/build-verified.sh`: PASS.
- `node --test tests/rendered-html.test.mjs`: 42/42 PASS.
- 공식 secret scan은 이번 작업트리와 접근 가능한 Git 이력을 검사한다. 최초 실행은 계정 간 Git 소유권 검사에서 시작하지 못했고, 해당 작업트리만 safe.directory로 지정해 다시 실행했다. 최종 결과와 원격 CI는 PR 본문에서 확인한다.
- 물리 휴대전화·Safari·공개 배포는 미검증이며 병합·배포는 주 담당이 조정한다.

## 개별 PNG와 Library 저장 결과

ZIP 없이 읽을 수 있는 검토 PNG 9개를 [docs/screenshots/tourism-scenes-20261006](screenshots/tourism-scenes-20261006)에 각각 저장했다.

1. KORETAIL-tourism-myeongdong-320-brief.png
2. KORETAIL-tourism-myeongdong-390-brief.png
3. KORETAIL-tourism-myeongdong-430-brief.png
4. KORETAIL-tourism-hongdae-390-brief.png
5. KORETAIL-tourism-seongsu-390-brief.png
6. KORETAIL-tourism-itaewon-390-brief.png
7. KORETAIL-tourism-weather-390.png
8. KORETAIL-tourism-event-390.png
9. KORETAIL-tourism-subway-model.png

현재 Library skill에서 제공한 helper 3개 전체를 새 전용 로컬 폴더로 읽었다. 공식 LibraryUploadWorkflow를 한 배치로 호출했고, Windows에서 허용된 사용자 Temp를 지정했다. 별도 전송/prepare/finalize를 수행하거나 helper를 변경하지 않았다. 처음에는 helper가 받지 않는 MIME 입력을 넣어 저장 전 스키마 검사에서 중단됐고, 해당 필드만 제거했다. 그 뒤 공식 helper의 인증된 도구 검색에서 `HostedAppsError: Library prepare_uploads is not available`로 중단됐다. Library prepare/finalize 호출이나 저장 결과는 없으며 새 Library ID는 발급되지 않았다. 직접 create 도구로 우회하거나 기존 참고 첨부를 다시 전송하지 않았다. 주 담당이 정상 지원 환경에서 이 9개 PNG를 Library에 저장해야 한다.

기존 준비 화면 Library `libfile_7ca095b66dc48191bfff236e064767c4`는 기존 ZIP의 ID이며 위 PNG 9개의 저장 ID로 사용하지 않는다.
