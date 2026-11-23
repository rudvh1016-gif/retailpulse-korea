# 코리테일 개인 도구 운영 출시

2026-11-22 KST 기준. 운영 계정 출시와 공항 데이터 정리는 별도 배포로 진행한다.

| 점검 | 현재 확인 | 운영 완료 기준 |
| --- | --- | --- |
| Google 로그인 | `koretail-login-test`에서 로컬 테스트용 웹 클라이언트와 테스트 모드를 확인했다. 브랜딩 설정이 비어 앱 게시를 진행할 수 없다. | 운영용 웹 클라이언트 발급 승인, 정확한 운영 콜백, 공개 사이트·개인정보처리방침·지원 연락처, 외부 게시 상태를 각각 확인한다. |
| 개인 도구 | 반복 근무, 날짜·내용으로 기록 찾기, 언어별 안내 문구, 오픈·마감 체크리스트, 알림 설정이 후보에 있다. | 두 실계정으로 로그인, 저장, 새로고침, 다른 기기 반영, 계정 분리, 로그아웃 및 탈퇴를 확인한다. |
| 출국장 알림 | 활성 화면에서 권한을 받은 브라우저가 해당 터미널의 공식 관측을 확인한다. 알림 전에 현재 계정 문서 버전을 재확인한다. | T1·T2, 자정 포함 교대, 오래된 관측, 권한 철회, 다른 기기 설정 변경, 중복 방지, 실제 PC/모바일 수신을 확인한다. |
| 탭 종료 후 출국장 알림 | 출시 후보의 알림 범위는 열린 계정 화면이다. | 닫힌 화면 수신이 필요하면 사용자별 Web Push 동의·구독 해제, 암호화 저장, 전송·보관 비용, 중복 방지, 모바일 수신을 별도 확인한다. |
| 운영 데이터 | PR #610의 일일 서울 정리는 11월 23일 첫 실행 예정이다. A4 T1·T2는 추가 DB에 저장 중이다. | 삭제 건수, 책정된 D1 쓰기, 전후 용량, 공항 정기 수집을 같은 성공 로그에서 확인한다. |
| A1 자정 복구 | 정기 수집은 최신으로 표시되고 과거 자동 복구 실행의 잠금이 남아 있다. | 열린 이력이 실제 완료한 GitHub 작업과 일치하는지 확인하고, 과거 실패를 기록한 상태에서 복구 경로를 검증한다. |

## 실행 순서

2026-11-23 KST: 운영자가 개인정보처리방침 확정 작업을 승인했다. [방침 본문과 공개 전 확인 항목](./KORETAIL_PRIVACY_POLICY_KO.md)을 함께 관리한다. 운영자·문의 창구와 실제 위탁·이전·보관 설정이 확인되어야 방침을 공개할 수 있다. 운영 Google 클라이언트에 관한 승인, Google의 검증 접수·결과, 운영용 클라이언트 생성 및 외부 게시는 각각 증거를 남긴다. 테스트 프로젝트 기록을 운영 심사 접수로 취급하지 않는다.

1. 운영자가 승인한 개인정보처리방침과 지원 연락처를 공개 사이트에 게시한다. 방침에는 구글 로그인 때 사용하는 검증된 계정 식별 정보, 개인 저장 자료, 실서비스의 보관·삭제 기간과 문의 절차를 명시한다. 홈페이지와 Google 동의 화면에 같은 HTTPS 방침 주소를 사용한다.
2. 운영용 Google 프로젝트를 `koretail-login-test`와 분리한다. 운영용 웹 클라이언트와 게시 상태를 Google Auth Platform에서 각각 확인한다. 공개 콜백은 `https://koretaildata.com/api/account/google/callback`이다. 비밀 값은 서비스 비밀 저장소만 사용한다.
3. 별도 검증 환경에서 개인 D1 연결, 로그인과 세션, 암호화된 저장과 복구, 공식 출국장 관측에 따른 테스트 알림을 확인한다. 운영 계정 DB는 공항 DB와 별도다.
4. 후보 PR의 서버/렌더링/브라우저 CI 결과를 확인한다. 환경별 인증 설정과 거부 경로를 검증하고 두 실계정 테스트가 통과하면 운영 계정 플래그를 켠다. 한국어 더보기 메뉴는 로그인 없이 받은 상태 응답이 계정 사용 가능을 확인한 뒤 내 계정 링크를 표시한다.
5. A1 과거 복구는 정기 수집과 별개로 다룬다. 운영 레코드의 실행 ID, GitHub 작업의 종료, 확정된 오류와 실제 저장 상태를 대조한 뒤 승인된 복구 절차를 사용한다.

## 비로그인 공개 검증

아래 명령에 승인된 방침의 실제 경로와 버전을 지정한다. 응답 코드와 판정만 출력한다. 계정 단계에서는 비로그인 상태와 비공개 자료를 요청했을 때의 거부를 확인한다. Google 발급·게시, 실계정 로그인, 기기 간 저장·알림 수신은 별도로 검증한다.

```sh
node scripts/verify-account-release-public.mjs policy https://koretaildata.com /APPROVED-POLICY
node scripts/verify-account-release-public.mjs account https://koretaildata.com /APPROVED-POLICY POLICY-VERSION
```

- [Google OAuth 브랜딩 요건](https://support.google.com/cloud/answer/15549049)
- [Google 운영 OAuth 프로젝트 분리 요건](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance#separate-projects)
- [Cloudflare D1 무료 플랜 한도](https://developers.cloudflare.com/d1/platform/limits/)
- [첫 서울 정리 PR #610](https://github.com/rudvh1016-gif/retailpulse-korea/pull/610)
- [계정 출시 PR #611](https://github.com/rudvh1016-gif/retailpulse-korea/pull/611)
