# 승객·환승 설명 높이 안정화 초안

기준 main `fcf529e0ec8405d10d3ba724a469eeab67fc3e71`
공개 사이트는 변경하지 않았으며 이 초안의 병합·배포는 실행하지 않음

## 문제와 수정

390px 한국어에서 승객 설명의 수집시각이 도착하면 설명이 2줄에서 3줄로 바뀌어 카드가 84.5→99px 높아짐
공개 단1회 진단에서도 아래 대기·시간대·증감 행과 공항 모형이 14.5px 내려갔다 돌아오는 이동을 확인
일본어390px는 fallback에서 실제 폰트로 바뀔 때 설명 3→4줄 변동도 로컬 재현

CSS 7줄만 추가해 모바일 카드에 실제 최장 문구 높이를 최소 공간으로 예약
한국어 및 넓은 모바일99px, 좁은 영어130px, 좁은 일본어113.5px, 가장 좁은 중국어113.5px
고정 height나 자르기 없이 더 긴 내용은 자연스럽게 늘어남
360/390px 영어의 평상시 짧은 내용에는 최대31px 여유가 추가되는 절충이 있음
데스크톱은 추가 높이 없음
날짜·출처·주의문구·수치·글꼴·이미지·데이터 계산은 그대로 유지

## 검증 근거

- 360/390/430/1440px × ko/en/zh/ja × 로딩·실자료·T1공통·실폰트·미정·과거일·부분자료 8상태
- 16조합 모두 pair 높이 변동0px, 문구 잘림·가로 넘침·페이지 오류 없음
- 기존 승객/환승18 + 새 높이 회귀16 = E2E34 PASS
- typecheck, 전체 lint 0오류·기존 경고12, 관련 unit19, UI Lock65, production build, rendered HTML49 PASS
- 반응형 경계380/381/420/421px ×4언어도 8상태 높이 변동0px
- 보호 파일과 기존 승인 manifest는 바이트 그대로 보존하며 검사 변경 없음
- 키보드 포커스 및 reduced motion 확인

동일 로컬 production fixture·gzip·Chrome390 DPR1·CPU4배·RTT150ms·1.6/0.6Mbps·coldcache 교대각3회, hydration후8초

|중앙값|수정 전|수정 후|
|---|---:|---:|
|CLS|0.0707507|0.0230938|
|LCP|1864ms|1840ms|
|long-task excess|372ms|431ms|
|전송량|712310 bytes|712359 bytes|
|요청|40|40|

LCP24ms 차이를 속도 향상으로 주장하지 않음
long-task excess는 Lighthouse TBT가 아님
공개 최종배포 CLS0.1311558/LCP4408ms와 절대값 직접 비교 금지
공개 재측정은 이 작업에서 실행하지 않음

## 파일과 화면

- `docs/reviews/glance-cls-reservation-evidence-20261014.json` — 행렬 및 3회 측정
- `docs/screenshots/glance-cls-20261014/before-ko-390.png`
- `docs/screenshots/glance-cls-20261014/after-ko-390.png`
- `docs/screenshots/glance-cls-20261014/before-en-390.png`
- `docs/screenshots/glance-cls-20261014/after-en-390.png`

스크린샷 수치는 통제된 테스트 fixture이며 현재 공항 관측값이 아님

기존 frontend-design 및 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) 기준으로 문구 보존·포커스·레이아웃·글꼴을 검토
새 글꼴·의존성·수집·분석 이벤트·외부 키 변경 없음

## 남은 단계

Draft PR의 정확한 head CI 확인과 root 검토 후 정상 병합·배포 여부 판단
이 작업은 병합·배포하지 않음
