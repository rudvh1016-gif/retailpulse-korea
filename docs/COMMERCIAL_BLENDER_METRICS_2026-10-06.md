# 최근 10분 내국인 카드 소비 — Blender 지표

사용자가 신한카드 소비 화면의 금액·건수·건당 평균에도 Blender 작업을 요청했다. 실제 Blender 5.2.1 Cycles로 지폐·카드·동전, 결제 단말기·영수증 묶음, 한 번의 결제 카드·영수증을 만들었다. 이미지에는 문장·숫자·평균 그래프를 굽지 않았다. 각 실제 수치와 단위는 기존 `<dl>` DOM에 유지한다.

PC에서는 세 지표를 같은 줄, 모바일에서는 금액·건수·평균 순서로 보여준다. 기존 검정 제목·폰트·10/12/14px 크기를 유지한다. 최근 10분·내국인 카드 결제 추정·오늘 누적 아님·활동 등급·관측 기준·수집 시각이 앞에 남는다. 기존 비교·출처·내국인/외국인 범위·평균 계산 설명은 키보드로 열 수 있는 `<details>`에 보존한다. 평균은 기존 하단 내림·상단 올림 범위를 그대로 사용한다. 비공개·자료 누락·0건·오래된 상태는 기존 의미 그대로이며 새 숫자를 만들지 않는다.

## 범위

- 기준 main `ef0e98c79ab92bafe5418c8baea0e62329d0c126`.
- `app/live-signals.tsx`에서 소비 표시 함수와 장면 import만 변경한다. 공항 요약·버튼·METAR, 서울 예측 차트·여행기록과 데이터 수집은 바뀌지 않는다.
- 보호 기준은 실제 변경한 `app/live-signals.tsx` 한 항목만 갱신한다. 나머지 보호 해시·cron·기존 승인 기록은 그대로다.
- 별도 `commercial-metric-scene.tsx`, `commercial-scenes.css`, 기존 정적 CSS 진입점 `prep-scenes.css`의 import. 단위 테스트가 직접 import하는 live-signals에는 CSS import를 넣지 않는다.
- Blender 생성기 `render-commercial-metrics.py`는 PR295의 실제 장면 도구 `render-prep-symbols.py`를 그대로 재사용하며 새 세 장면만 렌더링한다. 기존 업종·날씨 자산은 다시 생성하거나 덮어쓰지 않는다.
- 320/640 WebP 6개, 전체 51,982 bytes·최대 14,444 bytes. 치수·SHA는 `config/commercial-scenes-v1.json`. 지연 로딩·async·srcset·빈 장식 alt를 사용한다.

## 실제 검증

공개 화면과 공개 요약 2026-10-06 13:17 UTC를 기준으로 로컬 화면을 320/390/430/1280px에서 캡처했다. 금액 범위·138건·건당 평균 범위가 공개 화면과 일치한다. 제품에 해당 숫자를 하드코딩하지 않는다. 이미지 3종과 실제 PC/390px 화면을 픽셀로 확인했다.

새 행동 E2E 10개가 통과했다. 모바일 3폭·PC·4언어, 범위 유지, 0·표본 보호·오래된 상태·자료 누락, 키보드 설명, 44px 입력 영역, 검정 제목·글리프·가로 넘침·런타임 오류를 검증했다. 기존 `commercial activity and events expose their complete truth`도 통과했다. 단위 89개·타입·소스 린트·공식 빌드·렌더 HTML 42개가 통과했다. 보호 해시 일치와 공식 비밀키 패턴 검사는 현재 트리 및 검증된 기준 뒤 새 원격 커밋을 대상으로 기록한다. 새 공급자 호출·스케줄·DB 쓰기·유료 의존성은 없다.

참고 Library `libfile_79fcc3ac91e481919b024fddfed2a22c` 정식 소비 환경 전송은 최초 실패와 동일 호출 1회 재시도에서 Windows `os.setxattr` 오류가 발생했으며 최종 경로가 없다. 첨부 픽셀을 직접 보았다고 주장하지 않는다. 부모의 확인 내용과 실제 공개 화면을 사용했다. 원격 커밋·PR·CI·검토 파일 저장 상태는 PR 본문이 최신 기록이다. 공개 반영은 부모가 조정한다.

## 새 검토 파일의 Library 저장

정식 일괄 절차가 `Library prepare_uploads is not available`을 반환해 저장이 시작되지 않았다. 현행 Library 지침에 따라 순서대로 신규 생성했고 다음 6개가 모두 `succeeded`, 버전 0이다. Windows `os.setxattr` 미지원으로 로컬 메타데이터 적용만 실패했으며 Library 저장 성공과 구분해 기록한다.

- 320px: `libfile_b001948f4cb48191b22d71f3f811d719`
- 390px: `libfile_bfd52c4056ac8191aed04d5b39bb87c1`
- 430px: `libfile_d76892bca97881918b3f769ee6ba9168`
- PC: `libfile_56e2f07991948191a1b546e8b6c1ddfa`
- 펼친 설명: `libfile_8d98a4f82ec881918e6087c31938b7c1`
- Blender 원본·캡처 ZIP: `libfile_67a5f80f029c8191b080b4a4092f5fa3`
