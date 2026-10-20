# 도착국 면세 안내: 무료 원문 검사 준비

## 현재 완료 범위

로컬 준비 전용이다. 운영 자동 수집, 원격 실행, DB 쓰기, 공개값 승격,
공지 게시, 배포는 **활성화하지 않았다**. 새로운 AI 서비스·키·패키지·Cron도 없다.

- `config/customs-allowance-sources.json`: 표시 데이터의 12개 국가·지역, 공식 링크 60개.
- `lib/customs-allowance-check.mjs`: 구조검사, 해시, 원문 관측 상태, 제한된 읽기.
- `scripts/check-customs-allowances.mjs`: 기본 무네트워크 `--check`; 파일·DB 쓰기 없음.
- `tests/customs-allowance-check.test.mjs`: 네트워크 없는 응답 fixture 검사.

60개 링크는 **근거 목록**이지 매일 60개 모두 읽는 수집 목록이 아니다.
각 국가의 첫 링크 12개만 `priority_candidate`로 표시했다. 이는 수집 우선 검토
후보일 뿐, 현행성·자동 접근 허용·충분한 법적 범위가 확정됐다는 뜻은 아니다.
나머지 48개는 `reference_only`다. 시행령 개정, 금지품목, 공식 번역 등 필요한
추가 출처는 초기 검토 때 별도로 선별한다. 현재 코드에 자동 순환이나 일정은 없다.
주기 수집을 설계할 때는 검증된 핵심 현행 원문과 변경 공고만 우선 관측하고,
과거 법령·보충 안내·번역 등은 필요에 따라 검토할 근거 링크로 유지한다.

모든 실제 출처의 `accessReview`와 `baseline`은 아직 `null`이다.
사람이 공식 웹 문서를 읽었다는 사실은 반복 자동 접근 허용이나 실제 원문 bytes의
SHA256 검증이 아니다. 존재하지 않는 해시나 허용 검토를 만들지 않았다.
따라서 현재 구성으로 `--live`를 지정해도 해당 출처는
`ACCESS_REVIEW_REQUIRED`, 요청 0으로 종료한다.

## 실행

저장소 루트에 파일을 같은 상대 경로로 반영한 뒤:

    node --test tests/customs-allowance-check.test.mjs
    node scripts/check-customs-allowances.mjs --check

부분 checkout에서는 표시 데이터 경로를 직접 지정할 수 있다:

    node scripts/check-customs-allowances.mjs --check --data /absolute/path/arrival-allowances.json

추후 접근 검토가 된 출처에 한해 한 번의 읽기를 명시할 수 있다:

    node scripts/check-customs-allowances.mjs --check --live --source JP-01

`--live`는 반복 수집 활성화가 아니다. 정확한 ID를 지정해야 하며 한 번에 최대
24개 URL이다. 원문·검토·설정 파일을 쓰지 않고 JSON 보고서만 stdout으로 출력한다.
exit 0은 기술검사/관측을 마쳤다는 뜻이지 법령 검증·공개 승인을 뜻하지 않는다.
exit 1은 입력/구조 실패, exit 2는 수집 차단·실패다.

## 상태와 안전 경계

- `BASELINE_REVIEW_REQUIRED`: bytes를 받았지만 승인된 동일 URL 기준 해시가 없다.
- `UNCHANGED_SOURCE`: 이 URL의 bytes가 기준 해시와 같다. 전체 법령의 최신성 보장이 아니다.
- `SOURCE_CHANGED_REVIEW_REQUIRED`: bytes가 달라졌다. 규정이 바뀌었다는 확정이 아니다.
- `COLLECTION_BLOCKED`: 접근 검토 없음, 401/403/429, redirect, 알려진 차단 페이지.
- `COLLECTION_FAILED`: timeout, 네트워크, 크기/MIME/문자 인코딩/잘림 등.

모든 상태에서 `mayPublish=false`, `regulationChanged=null`,
`legalInterpretationVerified=false`, `automaticCollectionEnabled=false`다.
입력 last-good와 verifiedAt은 복제해서 보존한다. 원래 표시 데이터는 쓰지 않는다.
checkedAt만 별도 관측 정보다. 304로 검증일을 갱신하지 않으며, 이 최소 CLI는
조건부 요청을 보내지 않으므로 예고 없이 온 304를 오류로 처리한다.

HTML/PDF는 제한된 bytes와 기본 형식만 확인한다. PDF/OCR/법령 표 추출,
한국어 자동 번역, 통화·수량 계산, 국가별 법률 해석은 하지 않는다.
현재 UI의 문장형 값을 숫자와 단위로 검증했다는 주장을 하지 않는다.
`validateQuantity`는 추후 구조화된 입력용이며 현재 표시 문장에서 수량을
자동 추출하지 않는다. 실제 0과 미확인 null을 구분하고 0은 명시적 근거가 필요하다.
날짜·조건·단위·OR/AND·원문 표현은 변경 감지 대상이고 체크 시각은 의미 해시에서 제외한다.
공식 언어본 충돌과 새로운 법적 조건은 자동 해결 대상이 아니다.

응답당 1MiB, 전체 읽기 15초, 실행당 24회 상한이며 redirect를 따르거나
403/429를 우회·재시도하지 않는다. PDF가 크거나 HTML이 다른 인코딩이면
불확실한 추출 대신 실패 상태로 남긴다. 최대값을 늘리기 전에 출처별 검토가 필요하다.
제시된 주기 168시간은 계획 입력이지 현재 집행 중인 일정이 아니다.
이 read-only 도구는 최종 관측 시각을 저장하지 않아 반복 실행 간 최소 간격을
스스로 보장하지 못한다. 자동 일정 연결 전 지속 관측 저장·due 판단이 필요하다.

## 다음 실제 작업

1. 국가별 핵심 현행 원문과 별도 변경 공고를 선정한다. 60개 전체를 기본 수집하지 않는다.
   특히 이전 법령·개정문·공식 번역 간 역할과 의존 관계를 확인한다.
2. 각 선정 URL의 이용조건, 자동 접근 제한, 상업적 이용/재게시 범위와 허용 주기를
   확인한다. 정확한 URL에 결합된 evidenceUrl/reviewedAt/minIntervalHours를 남긴다.
   막힌 사이트는 우회하지 않고 수동 검토로 유지한다.
3. 허용된 한 번의 읽기로 실제 bytes·최종 URL·언어·형식을 확인한다.
   최초 SHA256은 자동 승인하지 않는다. 사람 검토가 정확한 source URL, bytes,
   표시된 나라·여행자 조건, 승인 자료와 연결된 뒤에만 baseline으로 기록한다.
4. 공식 번역 충돌, 시행일 미확인, PDF 추출 불가, 새 예외조건은 검토대기다.
   마지막 검증본과 그 검증일을 보존하고 미검증 변경수치·규정변경 공지는 노출하지 않는다.
5. 자동 운영을 별도로 승인받은 뒤 관측 저장·due 판단과 검토대기 후보 저장을 설계한다.
   기존 한국 관세청 RSS 공개 승인/테이블을 해외 규정 승인으로 확장하지 않는다.
6. 실제 Cloudflare Free 요금제·계정 총usage·잔여저장과 GitHub artifact 사용량을 확인한다.
   D1 변경 없음 반복·오류보존·CAS·공개 projection을 검증한 다음 기존
   `collect-production.yml`의 하루 한 번 이벤트 안에 gated 독립 job을 연결한다.
   새 Cron, 새 지속권한, AI 연결은 이 범위에 필요하지 않다.
7. 최종 커밋 전체 CI와 승인 이미지를 확인한다. 현재 배포 workflow는 main push CI
   성공 후 운영 migration·배포로 이어지므로 이미지 승인 전 main에 병합하지 않는다.

일정·DB 연결·기준 해시 생성·출처 허용 검토·실제 HTTP 검사는 이번 로컬 준비에서
완료하지 않았다. fixture 테스트 통과를 실제 무료 자동 수집 완료로 표현하지 않는다.
