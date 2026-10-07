# App Store 설명·심사 노트·촬영 계획 초안

최종 iOS 빌드 범위가 미확정이다. 아래는 게시 전 검토 자료이며 App Store Connect에 입력하지 않았다. 여행 기록 전용 클라이언트 골격에는 공항·서울 데이터 화면이 포함되지 않는다. 그 골격을 제출하면서 아래 전체 제품 설명을 사용하면 안 된다.

## 전체 제품을 포함하는 경우의 한국어 설명 후보

이름: `KORETAIL` (App Store 이름 가용성 미확인)

부제: `공항·서울 정보와 나의 여행 기록`

설명:

여행을 준비할 때 공항과 서울 지역의 정보를 살펴보고, 다녀온 여행의 한 장면을 기록하세요.

KORETAIL은 공항·지역 정보를 출처와 갱신 시각, 관측·예측 구분과 함께 보여 줍니다. 일부 정보가 오래되거나 확인되지 않으면 그 상태를 표시합니다. 현장 안내와 항공사·운영기관의 안내를 함께 확인해 주세요.

여행 기록에는 날짜, 출발·도착 공항, 짧은 메모와 선택한 사진을 남길 수 있습니다. 기록과 사진은 기기에 보관되며, 편집·개별 삭제·사진 제거와 페이지를 열어 둔 동안의 실행 취소를 지원합니다. JSON 백업을 내보내고, 복원할 기록을 미리 확인한 뒤 추가할 수 있습니다. 사진은 JPG·PNG·정적 WebP를 지원하며 HEIC/HEIF는 지원하지 않습니다.

한국어·영어·중국어 간체·일본어 화면을 제공합니다. 기록을 다른 기기나 앱으로 자동 동기화하지 않습니다. 기기를 바꾸거나 저장소를 초기화하기 전에 백업 파일을 보관해 주세요.

키워드 후보: `공항,서울,여행기록,여행메모,인천공항,지역정보,백업` — 최종 포함 기능에 맞춰 정리하고 경쟁사 상표·검증하지 않은 효과를 추가하지 않는다. 카테고리는 최종 앱의 주 용도를 보고 운영자가 결정한다. 가격·연령 등급·저작권자·판매자는 미확정이다.

여행 기록만 출시할 경우 설명 첫 문장은 “날짜, 출발·도착 공항과 짧은 메모, 선택한 사진으로 여행을 기록하세요.”로 시작하고 공항·서울 정보 문단과 해당 키워드를 제외한다. 앱 범위를 운영자가 확정하기 전에는 어느 후보도 제출하지 않는다.

## Notes for Review 후보

아래 절차는 현재 웹과 클라이언트 골격에서 확인된 기능에 근거한다. **최종 signed build에서 재현 후에만** 제출한다. 심사용 연락처·버전·빌드 번호는 운영자가 확정한다.

> KORETAIL lets users keep device-local travel records with a date, two airport names, a short note and an optional photo. Travel records do not require an account. To review, open Travel Records, add a record using a synthetic note and a JPG/PNG/static WebP, save, reopen and edit it. Choose Delete Record or Remove Photo; Cancel leaves data unchanged. Confirm applies the change and exposes Undo and a recovery JSON download while the page remains open. A newer edit in another tab is not overwritten by Undo. Closing the page or confirming Finish closes the in-memory undo copy. JSON restore validates and previews additions before confirmation; matching record IDs are skipped. HEIC/HEIF is intentionally unsupported. Please use an exported JPG or PNG.

별도 기입:

- 최종 앱에서 포함한 공항/서울 화면의 진입 경로, 공개 데이터 읽기 API와 네트워크 필요 범위, stale/missing 동작. 미포함이면 설명하지 않는다.
- 실제 native 파일 저장·공유·사진 선택 방식과 권한 사용 이유. 아직 구현하지 않은 camera/share plugin을 심사 노트에 지원한다고 쓰지 않는다.
- 로컬 여행 데이터가 웹 origin과 WKWebView origin 사이에 자동 이동하지 않는 점과 JSON 이전 절차.
- GA4/호스팅 요청 로그의 최종 사용 여부와 공개 Privacy URL. “개인정보 수집 없음”을 미리 기입하지 않는다.
- [Review Guidelines 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality): 웹 재포장보다 유용한 앱 경험이 필요하다. 로컬 기록·삭제/복구·백업, 네이티브 파일 처리와 offline cold launch를 실제 binary에서 증명하는 것을 목표로 한다. 이 PR이나 그 기능 목록은 심사 통과를 보장하지 않는다. 공개 URL을 단순히 `server.url`로 열어 완성됐다고 하지 않는다.

## 스크린샷 촬영 계획

[Apple 공식 screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)를 제출일에 다시 확인하고, 최종 지원 device family에 맞는 simulator/실기기 원본 해상도로 촬영한다. 데스크톱 390px 캡처를 iPhone 실기기 검증이나 제출 규격 캡처로 바꾸어 부르지 않는다. 필요한 iPad 슬롯은 최종 iPad 지원 여부로 결정한다.

| 순서 | 실제 앱에서 촬영할 장면 | 데이터·설명 원칙 |
| --- | --- | --- |
| 1 | 최종 앱의 주 화면 | 공항/서울 포함 빌드면 실제 상태·날짜·갱신시각을 보존. 미포함 골격은 여행 기록 목록만 촬영 |
| 2 | 여행 기록 작성·선택 사진 | 합성 메모와 사용권 확보한 사진. 실제 사용자 데이터 사용 금지 |
| 3 | 저장한 기록 상세 | 날짜·두 공항·짧은 메모·사진의 실제 기능. 기본 개념 그림을 사용자 사진으로 소개하지 않음 |
| 4 | 사진 제거와 실행 취소 | 기기에 기록이 남고 복구 선택을 보여 주는 실제 화면 |
| 5 | JSON 복원 미리보기 | 확인 전 추가 없음·중복 건너뜀을 실제로 표시 |
| 6 | 앱 내 지원/개인정보 | 승인된 공개 URL과 실제 도움말 구현 후 촬영 |

텍스트 overlay는 선택 사항이다. 이미지는 splash art만 나열하지 않고 사용 중 기능을 보여 준다. 최종 binary에 없는 기능·미검증 “실시간/정확도/완전 offline” 문구를 넣지 않는다. 설명·심사 노트·스크린샷의 언어와 기능 범위를 맞춘다.

아이콘은 새로 만들지 않는다. `assets-src/app-icons-20261007/render/koretail-flight-runway-1024.png`와 같은 폴더의 `.blend`, `checks/export-contract.json`, `checks/asset-validation.json`을 재사용한다. Xcode asset catalog 연결과 archive 아이콘 검사는 아직 남았다.
