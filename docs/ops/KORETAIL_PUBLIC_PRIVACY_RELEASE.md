# 코리테일 공개 개인정보처리방침 게시

이 경로는 계정 기능이나 Google 설정과 독립적으로 공개한다. 운영자가 공개 연락처를 제공했으며 실제 값은 승인된 운영 배포 설정에서만 주입한다. [계정 방침 원고와 새 검증기](https://github.com/rudvh1016-gif/retailpulse-korea/pull/618)는 개인정보 처리 내용을 작성하고 확인할 때 사용한다.

## 게시 전 확인

- 운영자의 공개 명칭 및 실제 수신하는 업무용 주소를 사용한다. Git 커밋·이슈·PR 본문에 다시 적을 필요가 없다.
- 실제 운영 자료를 기준으로 처리 항목과 목적, 본인·법정대리인의 권리 행사 절차, 보유 기간과 파기, 제공 및 위탁, 국외 이전, 쿠키·통계·운영 로그를 정리한다. 계약·콘솔 근거를 남기되 비밀 값이나 접속정보를 옮기지 않는다.
- Cloudflare 운영 Worker의 로그·샘플링·전송 설정, 계정 전용 D1의 실제 배치 및 복구 보관 조건, Google 로그인·통계 설정을 각각 확인한다. 공급사의 기본값을 해당 계정의 실측값으로 기록하지 않는다.
- 해당하는 국외 이전은 이전받는 자와 연락처, 항목·국가·시점·방법·목적·보유기간 및 이용자의 거부 방법과 영향을 운영 계약과 실제 설정에 맞게 기재한다.
- Google 제출 전에 한국어 홈의 방침 링크, 방침 본문, 문의 수단, 실제 시행일을 확인한다. 게시는 개인정보처리방침 공개이며 계정 기능이나 Google 브랜딩을 활성화하지 않는다.

## 운영 설정

Cloudflare의 해당 Worker에 `KORETAIL_PUBLIC_PRIVACY_POLICY`를 배포 변수로 연결한다. 평문 JSON 객체이며 각 값은 최종 검토한 일반 텍스트다. 홈페이지에는 링크만 표시되며, 값은 방침 페이지에서 공개된다. JSON에는 다음 문자열 항목을 모두 담는다.

| 키 | 내용 |
| --- | --- |
| `version`, `effectiveDate` | 공개 버전과 시행일(YYYY-MM-DD) |
| `operator`, `email` | 확정된 공개 운영자 및 개인정보 문의 주소 |
| `processing`, `rights` | 처리 항목·목적, 정보주체 권리와 행사 방법 |
| `retention`, `providers`, `overseas`, `logs` | 보관·파기, 제공·위탁, 국외 처리, 로그·쿠키·통계 |

설정이 비어 있거나 형식에 맞지 않으면 `/ko/privacy`가 404를 반환하며 홈에 링크가 생기지 않는다. 앱 배포 후 Worker에 변수가 유지되는지 확인하며, 수정과 롤백 시에도 문안과 실제 운영 설정을 일치시킨다. 공개 검증기가 포함된 작업 브랜치에서 아래 명령으로 확인한다.

```sh
node scripts/verify-account-release-public.mjs policy https://koretaildata.com /ko/privacy
```

공식 근거: [개인정보 보호법 제30조](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029332499) · [Cloudflare D1 저장 위치](https://developers.cloudflare.com/d1/configuration/data-location/) · [D1 복구 보관](https://developers.cloudflare.com/d1/reference/time-travel/) · [Google 브랜딩 검토](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
