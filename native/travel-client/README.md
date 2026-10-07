# KORETAIL 여행 기록 클라이언트 골격

공통 `app/travel-records-view.tsx`를 React DOM으로 실행하는 정적 Vite client다. SSR 출력 복사, remote server.url, Capacitor/iOS 프로젝트나 서명 자격은 포함하지 않는다. 기존 여행 기록·삭제/undo·백업 모듈을 그대로 공유한다. 기본 언어는 ko이며 네 언어를 선택할 수 있다. 공항/서울 화면은 이 골격에 포함되지 않는다.

재현·검증 명령과 Mac 후속 작업은 [빌드 인계](../../docs/app-store/build-handoff.md), 현재 결과와 한계는 [검증 기록](../../docs/app-store/verification.md)에 있다. `dist`를 임의로 공개하거나 완성된 App Store binary로 설명하지 않는다.
