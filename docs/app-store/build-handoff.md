# 클라이언트 설계와 iOS 빌드 인계

## 현재 경계

웹은 vinext/Vite SSR와 Cloudflare Worker/D1이다. `dist/server`는 Worker이고 `dist/client`만 복사하면 SSR route/state가 완성되지 않는다. 이번 `native/travel-client`는 별도 Vite entry로 browser-only React view를 실제 번들한다. Next router는 웹 wrapper에만 남고 공통 여행 view에는 Next·Worker·D1 import가 없다. 데이터 module import는 type-only다. `process.env` 기반 통계 모듈을 포함하지 않는다.

빌드 결과 `native/travel-client/dist/index.html`, 해시 JS/CSS, 동일한 개념 그림과 local fonts·기존 OFL license는 앱에 넣을 수 있는 클라이언트 자산이다. 결과물은 Git에서 제외한다. 전체 public 폴더를 복사하지 않는다. 공통 global CSS는 변경 없이 재사용하므로 클라이언트 골격의 CSS 크기는 아직 최적화 전이다. CSS의 `/fonts/…` build-time 경고는 선택한 fonts가 빌드 후 복사돼 런타임에 해소되는 구조이며, CSS가 참조하는 97개 font 경로의 파일 존재를 확인했다. 모든 자산은 WKWebView의 앱 origin 루트에서 제공해야 한다.

현재는 **여행 기록 전용 client prototype**이며 Capacitor package·ios project·App ID·signing team을 만들지 않았다. 새 runtime dependency, remote `server.url`, 인증서나 계정 설정을 추가하지 않았다.

## 재현 명령

저장소 루트에서 잠금 파일에 따라 `npm ci --ignore-scripts` 후:

```sh
node node_modules/vite/bin/vite.js build --config native/travel-client/vite.config.mjs
node node_modules/vite/bin/vite.js preview --config native/travel-client/vite.config.mjs --host 127.0.0.1 --port 4187 --strictPort
node node_modules/@playwright/test/cli.js test --config native/travel-client/playwright.config.ts
```

마지막 명령은 preview가 없으면 자체 server를 띄운다. 로컬에서는 앞서 실행한 동일 preview를 재사용한다. Windows에서 자체 server 종료가 지연되어 첫 실행은 9개 성공 후 해당 검사용 server 종료로 정리했고, 마지막 추가 검사는 수동 preview를 재사용해 정상 exit 0으로 끝났다. 기존 `e2e/travel-records-deletion.spec.ts`를 같은 core/view를 가진 정적 산출물에 대해 실행한다. 표준 repo Playwright 명령은 같은 spec을 웹 SSR route에 대해 실행한다. 합성 fixture만 사용하며 실제 저장소를 지우지 않는다.

## 최종 앱 최소 설계

1. **local app shell:** React entry·hash route·four locales·local fonts/art와 기록/백업/설정·도움말을 번들. 오프라인에서 cold launch와 기록 읽기/작성/삭제/복구 가능 여부를 WKWebView에서 입증한다.
2. **device storage adapter:** 현재 IndexedDB core를 출발점으로 유지한다. 웹과 앱은 서로 다른 origin이므로 자동 이전을 가정하지 않는다. 실제 WKWebView의 앱 종료·업데이트·OS 저장소 정리와 용량·백업 거동을 확인한 뒤 필요할 때만 native persistence adapter를 추가한다.
3. **file/photo adapter:** 현 HTML file input·Blob download를 재사용 가능성 검사에 쓰되 native 파일 선택·Share/Filesystem bridge를 분리한다. 취소·목적 파일 확인·failure/low storage를 포함한다. camera plugin은 요구하지 않으면 추가하지 않는다. HEIC 지원을 별도 만들기 전에는 명시적 미지원 안내를 유지한다.
4. **remote read adapter:** 공항/서울 화면을 최종 범위에 넣기로 결정한 경우에만 승인된 JSON read API contract를 얇은 client adapter로 연결한다. 지연·오프라인·stale/missing/forecast truth label을 유지하고 서버 키·collector·D1 writer는 앱에 포함하지 않는다. 현재 self-only CSP를 네트워크 목적지에 맞춰 최소 범위로 변경하는 일은 이후 승인된 구현 범위다. 이번 골격은 외부 API를 요청하지 않는다.
5. **web UI와 공유:** client-safe components를 제한적으로 추출하되 지금 다른 작업자가 소유한 핵심 shell/카드는 손대지 않는다. 전체 SSR 앱을 다시 쓰는 프로젝트로 확대하지 않는다. 최종 제품 범위·4.2 근거를 먼저 확정한다.

[Capacitor workflow](https://capacitorjs.com/docs/basics/workflow)와 [config](https://capacitorjs.com/docs/config)에 따라 실제 client build directory를 webDir로 사용하고 build→sync→Xcode 단계로 진행한다. `server.url`은 본 골격에 없다. 최종 appId는 소유자가 정한 identifier를 쓰고 가짜 bundle ID로 플랫폼을 생성하지 않는다. 추후 골격 폴더를 Capacitor project root로 사용할 때 webDir은 `dist`; repo root를 쓸 때는 `native/travel-client/dist`가 된다.

## Mac 작업자의 순차 체크리스트

- [ ] 운영자가 최종 출시 범위(전체 KORETAIL/기록 중심), Mac 접근, Apple Developer Program 자격·판매자 명의·App ID·국가 범위를 확정한다. 이번 작업은 가입·결제·약관 동의 권한을 포함하지 않는다.
- [ ] 최신 공식 요구 다시 확인: [Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)는 2026-10-07 UTC 확인 시 2026-04-28부터 Xcode 26 이상 및 iOS 26 SDK 이상, 2026-09-09부터 iOS/iPadOS 최소 target iOS 13 이상을 명시한다. [Capacitor iOS v8 문서](https://capacitorjs.com/docs/ios)는 Xcode 26.0+와 iOS 15+를 명시한다. SDK build 요구와 deployment target을 혼동하지 말고 선택 runtime의 더 높은 최소 버전을 따른다.
- [ ] 선택 Capacitor 버전·plugin 버전·라이선스·최소 target을 잠금 파일로 고정하고 client build를 재검증한다. native folder에 project를 생성한 다음 실제 `webDir` 내용만 sync한다. Swift/Pods/SPM 선택은 버전 공식 문서에 맞춘다.
- [ ] 권한 purpose strings, privacy manifest와 required-reason API 사용을 실제 SDK inventory로 작성한다. 쓰지 않는 권한은 요청하지 않는다. ATT 필요성은 실제 tracking 관계로 판단하며 GA4 opt-in과 혼동하지 않는다.
- [ ] 1024 source icon과 검증 기록을 재사용해 asset catalog를 연결한다. 최종 이미지 규격·알파와 archive 내 앱 아이콘을 실제로 확인한다.
- [ ] iPhone Safari와 native WKWebView를 따로 검사한다: 사진 picker 취소·JPG/PNG/WebP·HEIC 거부, 키보드·safe areas·zoom·VoiceOver·텍스트 크기, 저장/새로 열기/앱 재시작, 삭제 취소·undo·다른 창 충돌, JSON 파일 실제 저장 위치·share 취소·복원 미리보기·대용량/부족 공간.
- [ ] 웹→앱 JSON 이전, 앱 업데이트·제거/재설치 후 기록 지속/손실 경계를 기록한다. 기존 사용자 데이터를 시험용으로 삭제하지 않는다. 실험은 별도 QA 기기/합성 데이터로 한다.
- [ ] network offline에서 최초 실행·기록 기능과 remote 데이터 상태, 재연결 오류 복구를 검증한다. 번들에 키·비공개 URL·운영자 사적 연락처가 없는지 확인한다.
- [ ] 승인된 개인정보/지원 내용을 공개 URL과 앱 내 도움말로 연결하고 최종 App Privacy 항목을 확인한다. 로그·GA4·이메일 보관기간을 확정한다.
- [ ] 최신 main의 별도 핵심 카드 변경·필수 CI를 확인하고 최종 signed archive의 버전/빌드 번호·entitlements·export compliance·launch/network traces를 확인한다.
- [ ] 최종 빌드로 스크린샷·심사 노트를 갱신하고 TestFlight/심사/공개 전 별도 사용자 승인을 받는다. signing key 생성·업로드·Store 제출·공개는 이 인계에서 실행하지 않는다.

Windows의 JS build와 Chromium 검사는 위 체크의 iOS 서명·archive·실기기·심사 완료를 증명하지 않는다. 계정·기기·정책 확정이 남아 있는 동안 앱 출시 완료 상태는 BLOCKED다.
