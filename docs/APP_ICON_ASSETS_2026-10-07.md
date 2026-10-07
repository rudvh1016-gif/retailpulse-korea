# KORETAIL 앱 아이콘 소스 자산과 연결

실제 Blender 5.2.1 LTS / Cycles CPU로 만든 비행기·활주로 아이콘 자산을 보존하는 검토용 변경이다. 기존 원본 `icon_flight_v2/flight-B.blend`의 모형·재질을 재사용하고 카메라 여백·렌더 설정만 조정했다. 이전 후보의 앱 아이콘 최종 승인을 가정하지 않고 이번 구현 요청의 차분한 파스텔 방향으로 정리했다. 아이콘에 긴 글자를 굽지 않으며 KORETAIL 이름을 유지한다.

![실제 크기·마스킹 예시](../assets-src/app-icons-20261007/previews/app-icons-review.png)

## 반영 상태

첫 아이콘 연결 명령은 자동 승인 검토에서 실행 전에 거절되어 소스 자산만 보존했다. 이후 연결·검사 기준 갱신·검토용 PR 생성 범위가 재개됐고, 아이콘 연결 명령을 한 번 재시도한 결과 허용되어 실행됐다. 기존 아이콘 이름과 새 버전 URL을 실제 public 경로에 연결하고 app/layout.tsx의 favicon·Apple Touch·manifest 참조를 갱신했다. 두 번 거절된 핵심 카드 변경과 통합 담당 소유 PR266 공유 이미지는 포함하지 않는다.

기존 보호 파일 53개를 모두 유지하며 아이콘에 관련된 7개 해시만 정상 기록으로 갱신했다. 새 아이콘 경로 8개를 같은 활성 검사에 추가해 총 61개를 보호한다. 원래 검사 코드·스케줄·다른 보호 해시는 유지한다. 이는 검토 브랜치의 연결이며 운영 배포 완료를 뜻하지 않는다. 최종 병합은 사용자가 직접 한다. 첫 거절 기록은 checks/connection-blocked.json에 이력으로 남기고 현재 연결 상태는 checks/application-connection.json에 기록한다.

## 준비한 자산

`assets-src/app-icons-20261007` 아래에 최종 `.blend`, 확인 가능한 기존 원본 `.blend`, 실제 1024px 렌더, 축소·ICO·SVG·manifest 생성 스크립트와 출력 파일을 보존한다. favicon은 16·32·48px ICO와 같은 Blender 픽셀을 내장한 SVG, Apple Touch는 180px, 일반 manifest 아이콘은 192·512px, maskable은 512px로 준비했다. 모든 설치용 PNG는 전체 사각형·불투명 RGB다. OS 형태는 검토 이미지에서만 적용했다.

배경을 제외한 모형 정점의 투영 반경은 0.385다. [W3C Manifest 안전 영역](https://www.w3.org/TR/appmanifest/#icon-masks)의 중앙 0.4 반경 안에 주요 조형을 두었다. Apple 링크는 [공식 Web Clip 문서](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)를 참고했다. 예시 마스크를 각 OS의 정확한 실제 형태라고 주장하지 않는다.

연결은 `-20261007` URL과 같은 바이트의 기존 이름 호환 파일을 사용하며 manifest `id=/`, `/ko` 시작 주소, `/` scope, KORETAIL 이름을 유지한다.

## 검증 범위와 설치 캐시

실제 Chrome에서 390·1280px 미리보기의 모든 이미지 디코딩, 가로 넘침 없음, 실행 오류 없음을 확인했다. 실제 Blender 실행·저장·렌더와 PNG 크기/불투명 배경·ICO 프레임·SVG 내장 이미지·안전 영역 검증 결과를 재사용한다. 연결 변경에 대한 설치·아이콘 계약과 활성 Owner UI Lock 검사, 로컬 HTTP 메타데이터·파일 응답을 확인한다. 필수 저장소 CI는 새 PR HEAD에서 확인한다.

2026-10-07 05:51 UTC 공개 사이트에서 기존 아이콘의 1주일 캐시와 manifest의 1일 캐시를 확인했다. 새 URL은 새 파일 요청을 분리한다. 기존 iPhone 설치 아이콘의 자동 갱신, iPhone/Android 실기기 설치와 OS 색조 모드는 검증하지 않았다. 운영 서버 반영은 사용자 병합 이후의 별도 단계다.

재현은 소스 폴더에서 `blender --background --python rerender-icon.py`, Pillow가 있는 Python에서 `python export-icons.py`로 한다. 이는 소스 폴더 안의 렌더·자산을 생성하며 앱의 public 파일이나 보호 기준을 수정하지 않는다. 출처·해시·카메라는 `checks/blender-provenance.json`, 마스킹과 크기는 `checks/export-contract.json`, 차단은 `checks/connection-blocked.json`에 기록한다.
