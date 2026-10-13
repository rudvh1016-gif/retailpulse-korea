# 출국장 대기 글씨 축소와 SUIT 비교 시안

사용자 요청: “개념 모형 · 인물은 장식 < 문구삭제해 그리고 대기랑 숫자랑 이런거 글자크기 더줄여 너무커 폰트 더예쁜무료폰트로바꿔”. 후속 지시대로 크기 정리와 다른 폰트 비교를 분리했습니다. 공개 병합·배포하지 않은 검토본입니다.

## 적용된 코드
- 그림 바로 위 장식 안내 한 줄을 4개 언어에서 제거했습니다. 접힌 상세의 공식 좌표/실제 인원 구분, 현재 관측 기준, 시각·출처는 유지합니다.
- 대기 패널의 숫자/제목은 12px, 구역/대기 인원/단위는 11px, 굵기는 400/500으로 조정했습니다. 기존 수치 계산, 0·미제공·운영 종료와 오래된 관측 처리는 그대로입니다.
- 현재 일반 화면은 기존 Pretendard 기반 `KORETAIL Sans Variable` 경량 파일을 사용합니다. 폰트를 교체했다고 주장하지 않습니다. 전역 글꼴·보호 파일·UI Lock manifest를 변경하지 않았습니다.

## 새 글꼴 비교 후보: SUIT
공식 제작자 소개: https://sun.fo/suit/
공식 배포: https://github.com/sun-typeface/SUIT
고정 커밋: `55118d981336d8fce005eb62888c12c0568ef7b0`.
라이선스 원본: https://github.com/sun-typeface/SUIT/blob/55118d981336d8fce005eb62888c12c0568ef7b0/LICENSE

SIL OFL 1.1. 공식 파일을 수정하지 않고 라이선스/저작권을 함께 보존합니다. 상업적 웹 임베딩에 사용할 수 있으며 폰트 자체의 단독 판매 등 OFL 조건은 유지됩니다. SUIT 400은 167,672바이트, 500은 170,956바이트, 합계 338,628바이트입니다. 624,536바이트 전체 가변 파일과 다른 굵기는 추가하지 않았습니다.

`public/previews/checkpoint-suit/font-comparison.css`는 테스트/검토에서 명시적으로 로드할 때만 `[data-font-preview='suit']` 대기 패널에 적용됩니다. 앱의 CSS나 HTML에는 연결하지 않았으므로 일반 화면의 폰트 요청은 추가되지 않습니다. 전역 교체는 별도 선택 전 실행하지 않습니다.

## 실제 렌더 비교
`docs/screenshots/checkpoint-type-20261013/`의 pretendard/suit 390px, 1280px PNG는 같은 고정 테스트 데이터로 캡처했습니다. 실제 최신 대기 수치라고 소개하면 안 됩니다. 60+, 0, 중단, 7~10명, 128명 등 숫자/한글 균형을 확인했습니다. T1 320px에서 1,234명, 0명, 미제공도 별도 검사했습니다. 상세 키보드 열기·출처 링크·전체 8개 구역·모바일 가로 넘침·콘솔 오류를 검사했습니다.

검증: 타입, 해당 TSX/E2E lint, Owner UI Lock, 4개 언어 320/360/390/430/1280 E2E 10개, production vinext build, 서버 HTML 49개 통과. Windows에서는 bash build 진입점 대신 같은 vinext CLI를 실행했습니다. 전체 Linux CI 결과는 초안 PR에서 별도로 확인해야 합니다.

첨부 참고 Library `libfile_a38235862a6481918e76b4ec4e667012`는 지원 materialize helper가 Windows `os.setxattr` 부재로 실패해 픽셀 확인을 완료하지 못했습니다. 해당 문구의 실제 코드와 렌더를 기준으로 수정했습니다.

## 전달된 Library 이미지
- Pretendard 모바일: `libfile_5bdb7da9cfdc81919cd5dd7a376c5055`
- SUIT 모바일: `libfile_4ba28bccc77c819183ec436c7d4fd557`
- Pretendard PC: `libfile_b3b60e2c19d48191bd3acdb9ab600aa2`
- SUIT PC: `libfile_a52826c5e97c8191b38a7879549ecf8f`

4개 Library 생성은 성공했습니다. 로컬 xattr 기록은 동일한 Windows API 제한으로 저장되지 않았으며, 위 ID와 파일 이름으로 연결을 보존합니다.
