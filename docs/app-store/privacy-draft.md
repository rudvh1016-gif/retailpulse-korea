# 개인정보 조사와 공개 안내 초안

상태: **운영자 검토용 / 게시 금지**. 코드 기준 `bf936246` 및 이번 여행 기록 변경. 실제 서비스·App Store 빌드 환경의 GA4, 로그 설정과 보관기간은 별도 확인이 필요하다. 공개 연락처나 정책 시행일을 추측하지 않았다.

## 코드에서 확인한 흐름

| 데이터 | 처리·전송·저장 | 근거 | 남은 확인 |
| --- | --- | --- | --- |
| 여행 날짜, 출발·도착 공항, 80자 메모, 사진 | 브라우저 IndexedDB `koretail-travel-local-v1`의 records. 사진은 기기에서 크기 조정·재인코딩한 Blob. 사진 URL은 `blob:`이며 정리 시 revoke. 여행 기능에 fetch/upload/server action/analytics event 없음. record ID는 URL hash에만 위치 | `lib/travel-records/storage.mjs`, `model.mjs`, `photos.mjs`; `app/travel-records-view.tsx`, `form.tsx`, `media.tsx` | iPhone Safari/WKWebView 저장 유지·사진 처리; OS 백업·제거 영향; 영구 보존 보장 불가 |
| 삭제·사진 제거의 복구 사본 | 한 변경의 메모리 사본. 원본 정보가 페이지 종료 또는 확인 후 마치기까지 남는다. 영구 휴지통 없음. JSON 다운로드는 원본 사진도 포함 | `app/travel-records-actions.tsx` | 사용자 파일앱·클라우드 동기화 위치는 서비스가 통제하지 않음 |
| JSON 백업·복원 | 사용자 다운로드 파일에 메모·사진 바이트 포함. 읽기·검증·미리보기는 기기 내; 확인 후 atomic import. 기존 동일 ID/중복 내용은 덮어쓰지 않음 | `backup.mjs`, `photos.mjs`, `travel-records-backup.tsx` | 다운로드가 실제 보관됐는지는 기기에서 확인. 사진 제거·삭제는 기존 파일을 삭제하지 않음 |
| 개인 브리핑 선호·통계 동의 | `koretail-personal-v1` localStorage: 역할·지역·터미널·관심·일자·analytics flag. 기본 추천 analytics=false. 설정을 기기에 저장 | `lib/personal-briefing.ts`, `app/personal-preferences.ts` | native 골격에는 개인 브리핑/GA4 없음; 최종 앱에 포함할 기능 범위 확정 |
| 업무시간·체감 기록·최근 확인·선택 매장·피드백 | 기기 localStorage. 일부 실패 시 메모리 fallback; 피드백 ledger는 최근 100개 | `app/business-preferences.ts`, `business-compare.tsx`, `airport-day-radar.tsx`, `personal-preferences.ts`; `lib/feeling-log.ts`; 보호된 `live-signals.tsx`는 읽기만 함 | 실제 최종 앱 저장키 inventory와 개별 초기화 UI 검토 |
| 선택적 이용 통계 | 빌드에서 `NEXT_PUBLIC_GA4_ENABLED=true`, 유효 measurement ID, 사용자 동의가 모두 있어야 Google tag 삽입. allowlist 이벤트와 역할·지역·터미널·관심·언어·일자·상태 enum 전송. 직접 page view, query/hash/title/referrer, 이름·이메일·자유문구는 코드에서 배제. 광고 관련 동의 denied, Google signals/personalization false | `lib/personal-analytics.ts`, `lib/personal-copy.ts` | 배포 시 enable flag, GA4 Enhanced Measurement 전체 해제, 쿠키·식별자·IP 등 SDK의 실제 payload, 링크/추적 여부·Google 계정 보관기간·삭제 수단. opt-in이 App Privacy 신고 면제를 뜻하지 않음 |
| 웹/API 요청·운영 로그 | 웹 화면과 읽기 API는 Cloudflare로 요청. `wrangler.production.jsonc` observability.enabled=true. Worker는 정해진 scheduler dispatch 결과를 console.log. 여행 JSON/사진은 여기로 보내는 경로가 없음 | `worker/index.ts`, `wrangler.production.jsonc`, `lib/realtime-dispatch.ts` | 실제 요청 metadata/IP/오류·URL 수집 범위, Cloudflare 보관·sampling·접근 주체. 현재 설정만으로 수집 없음 주장 불가 |
| 선택적 beta 이메일 | `ENABLE_BETA_SIGNUPS=true`일 때 POST로 email·segment·locale·sourcePath·consentVersion·시각을 D1에 저장. DELETE 경로 존재. checked-in staging/production vars는 false | `app/api/beta-signups/route.ts`, `db/schema.ts`, `wrangler.production.jsonc` | 런타임 override 여부, 신청 UI 최종 빌드 포함 여부. 이 API는 계정 인증 기능이 아니며 이 PR에서 활성화하지 않음 |

## 게시용 문장 초안

KORETAIL의 여행 기록 기능은 날짜, 출발·도착 공항, 짧은 메모와 선택한 사진을 현재 브라우저의 기기 저장소에 보관합니다. 이 기능의 사진 처리와 JSON 복원 검증은 기기에서 수행됩니다. 다른 브라우저, 도메인 또는 기기에서는 같은 기록이 자동으로 나타나지 않습니다. 저장소 초기화, 비공개 탐색이나 앱 제거로 기록이 사라질 수 있으므로 JSON 백업을 보관해 주세요.

기록 상세에서 기록을 삭제하거나 사진만 제거할 수 있습니다. 확인 전 취소하면 기록이 바뀌지 않습니다. 확인 후에도 이 페이지를 열어 둔 동안 한 변경을 실행 취소할 수 있으며, 그동안 복구 사본이 페이지 메모리에 남습니다. 변경 마치기를 확인하거나 페이지를 종료하면 실행 취소 사본을 잊습니다. 내려받은 JSON 파일과 이전 백업에는 삭제 전 기록과 사진이 남을 수 있습니다. 해당 파일의 보관·삭제와 사용자가 선택한 클라우드 파일 서비스의 처리는 별도입니다.

웹 서비스의 기능별 설정은 기기에 저장될 수 있으며, 사용자가 이용 통계에 동의하고 서비스에서 GA4를 활성화한 경우 허용된 이용 이벤트가 Google Analytics로 전달됩니다. 웹/API 요청은 서비스 제공과 오류 확인을 위해 호스팅 제공자의 처리를 거칩니다. **운영자, 실제 전달 항목, 제공자별 처리·보관·삭제 조건과 문의 수단을 확인한 뒤 이 단락을 최종 확정해야 합니다.**

## 공개 전 확정할 항목

1. 개인정보 처리 주체의 공개 명칭과 사용자가 승인한 공개 연락처, 시행일·개정 이력.
2. 최종 iOS binary의 SDK·plugin·API·네트워크 inventory와 GA4/Cloudflare 실제 수집. beta 이메일 기능의 공개 여부.
3. 항목별 목적, 제공/위탁·국외 이전 등 적용되는 설명, 로그/통계/신청 데이터 보관기간·삭제 절차. 숫자를 임의로 만들지 않는다.
4. 최종 Privacy Policy URL의 공개 접근성 및 앱 내 접근 경로. 현재 `/privacy`, `/support` 경로는 없다.
5. [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) 기준으로 최종 앱의 수집 여부·타입·목적·사용자 연결·추적을 검토한다. Apple 기준의 collection은 off-device transmission 및 요청 처리 이후의 retention을 포함하며 기기 내 전용 처리는 구분한다. 로컬 여행 기능만으로 전체 앱을 “Data Not Collected”로 답하지 않는다. 자유문구·사진·이용정보·진단/식별자·이메일 등은 실제 전송과 저장이 확인되면 각각 검토한다.

이는 조사에 근거한 초안이며 확정된 법률 판단이나 제출된 App Privacy 답변이 아니다. SDK 추가나 데이터 흐름 변경 시 다시 확인한다.
