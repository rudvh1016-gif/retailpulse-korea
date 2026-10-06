# 서울 영업시간 준비 — Blender 항목 모형

`영업시간에 맞춘 준비`의 서울 화면에서 다섯 가지 공식 사실을 모형, 짧은 검정 제목, 실제 수치·대상 시간으로 읽게 한다. 긴 원문과 자료의 한계는 HTML `details`에 보존한다. 준비할 일의 기존 제목은 보이고 실행 방법·업종 체크·판단 근거는 함께 펼친다. 기존 폰트와 크기, 조건 선택·영업시간 저장·자정 넘김·공유·공항 동작·자료 판단 규칙을 유지한다.

이 작업은 업종 가이드 PR #286 위의 별도 작업트리에서 시작했다. PR286 병합 후 최신 main `e61acd8b5a54b53416ef8c2f3b893a6535629be5`의 source tree가 검증 시작점 `81cf10a1cd4fde2a3e2c1749ca10e11be1309747`과 동일함을 확인하고 정상 fast-forward로 기준을 갱신했다. 이 PR에는 준비 화면 변경만 포함한다. 병합 순서는 주 담당이 조정한다.

## 장면과 데이터 의미

| 장면 | 실물 구성 | HTML의 값 |
|---|---|---|
| crowd | 빈 대기 벨트 동선·계산대·결제 단말 | 공식 혼잡 예측의 최고 단계와 해당 시간 |
| rain | 접힌 우산·우산 보관대·마른 입구 매트 | 최고 강수확률과 해당 시간 |
| temperature | 화면이 빈 온도계·눈금 없는 환경 조절 다이얼 | 기존 기온 최저·최고 값 |
| holiday | 날짜가 빈 책상 달력·노트·연필 | 실제 공식 공휴일의 국가·명칭 |
| event | 빈 공연 무대·마이크·안내대 | 기간이 서비스 날짜를 포함하는 근처 공식 행사 수 |

모형에는 글자, 날짜, 읽을 수 있는 측정값, 사람 수 또는 비·맑음·폭설 등의 날씨 상태가 들어가지 않는다. 강수확률 0%도 같은 접힌 우산 준비 모형과 실제 0%로 표시한다. 자료가 없거나 오래되어 기존 규칙이 사실을 만들지 않으면 해당 모형도 렌더링하지 않는다. 공항 관측 API, 풍속·난기류·추가 자료 요청을 연결하지 않는다. 매출·방문객 추정은 추가하지 않는다.

`AreaPrepFact`는 표시만 담당하고 기존 `buildBusinessPrep`, `factLine`, `actionText`, `evidenceText`, `limitLine`을 사용한다. 수치와 원문은 이미지 밖의 DOM에 남는다. 공항은 기존 사실 문장과 펼쳐진 실행 설명을 사용한다. 새로운 CSS는 `data-place="area"` 범위로 제한하며 다른 화면·전역 CSS·보호 fixture는 수정하지 않는다.

## 자산과 재현

- 실제 Blender **5.2.1 LTS**, Cycles 48 samples, denoising, AgX, 투명 RGBA WebP quality 86.
- 5개 모형, 각 320×240 / 640×480, `srcset`, 크기 예약, `loading="lazy"`, `decoding="async"`, 장식용 빈 alt.
- 전체 10개 이미지 **86,802 bytes**, 개별 **3,796–15,768 bytes**, 32 KiB 상한. 실제 한 화면은 존재하는 항목의 선택된 해상도만 요청한다.
- `config/prep-scenes-v1.json`에 각 파일 크기와 SHA256을 기록했다.
- `scripts/render-signal-scenes.py`를 Blender background mode로 실행하면 5개 `.blend`와 WebP를 다시 만든다. 기존 업종 장면의 색 관리·재질 마감·조명 방식과 맞췄다. 업종 원본은 다시 생성하지 않았다.
- 편집 가능한 원본 5개와 스크립트: `docs/assets/prep-signals-v1-blender.zip` (**593,391 bytes**).

## 검증

- 준비·공항 E2E: 기존 및 폭 320 추가 사례 **42 PASS**, 새 이미지·키보드·0%·자료 누락 사례 **4 PASS**. 첫 실행의 새 검사 4건은 srcset의 density-corrected `naturalWidth` 및 기존 상태 규칙을 잘못 기대해 실패했다. 테스트 기대를 바로잡고 해당 4건만 재실행해 통과했다. 앱 코드를 검사에 맞춰 바꾸지 않았다.
- 네 언어, 영업시간 저장·자정 넘김·저장 차단·지역/공항 전환·공유 원문 보존·공항 회귀를 확인했다.
- `node --import tsx --test tests/business-prep.test.mjs tests/operational-phase2.test.mjs`: **62/62 PASS**, Owner UI Lock 포함.
- 타입 검사 PASS, 전체 lint **오류 0 / 기존 경고 7**.
- 공식 `scripts/build-verified.sh` bounded build PASS. Windows 정상 사용자 UTF-8 Git Bash 환경을 사용했다. 제한 계정의 경로 변환 실패는 source나 build script를 수정하지 않고 해결했다.
- 320/390/430px 실제 로컬 앱의 다섯 모형 로딩, 검정 제목, 넘침 없음, 접힌 설명, page error 없음. 확인에 사용한 실제 공개 summary 기준 시각: **2026-10-06T09:27:06.677Z**. 검토 snapshot은 코드 상수나 예측으로 추가하지 않았다.
- `node --test tests/rendered-html.test.mjs`: **42/42 PASS**.
- 모든 보호 파일 SHA256 불일치 **0**. secret scan·원격 CI는 PR 인계 기록에 마지막 결과를 남긴다.

## Library 검토 파일

`KORETAIL-business-prep-review.zip` (ZIP, **930,816 bytes**) 저장 성공: **libfile_7ca095b66dc48191bfff236e064767c4**, version 0. 320/390/430px 준비 화면 캡처 3장, 390px 실행 방법·근거 펼침 캡처 1장, 다섯 모형 갤러리 1장, 실제 데이터 DOM 검증 JSON, 자산 manifest, 편집 가능한 원본 5개와 스크립트 ZIP, 이 화면 문서를 포함한다. 이전 업종 가이드·관광 안내·서울 공통 날씨 화면은 들어가지 않는다.

Library 저장 응답은 성공이며 원본 로컬 경로와 반환된 ID·버전·xattrs를 별도 identity JSON으로 보존했다. Windows 공식 helper의 `os.setxattr` 미지원으로 로컬 확장 속성 적용은 불가능했다. 저장 성공과 로컬 속성 실패를 구분하며 업로드를 반복하지 않았다.

원래 Library 참고 첨부는 앞선 공식 materialization의 Windows `os.setxattr` 미지원 때문에 픽셀 비교하지 못했다. 전송 재시도나 비공식 우회는 수행하지 않고 실제 앱과 새 Blender 자산으로 검토했다. 물리 휴대전화 및 Safari는 미검증이다. 관광 안내·공통 서울 날씨의 연결은 후속 화면이며, 이 PR에 포함하지 않는다.
