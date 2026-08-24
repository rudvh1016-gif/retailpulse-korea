# RetailPulse Korea public repository security preflight

## V6.1 재검사 요약

- `npm audit --omit=dev --audit-level=high`: Production dependency 취약점 **0건**.
- 전체 개발 도구 트리에는 `vinext`/Vite/Cloudflare/Drizzle 하위 경로의 경고 14건이 남는다. 제시된 일괄 수정은 breaking major/beta 업그레이드가 필요해 현재 배포 스택에 강제하지 않았다.
- 알려진 잔여 경고는 주로 개발서버·빌드 도구·파서 경로다. 공개 개발서버 금지, 외부 비신뢰 이미지/YAML 빌드 입력 금지, bounded CI, lockfile 고정으로 노출을 줄인다.
- 따라서 “전체 개발 도구 취약점 0건”이라고 주장하지 않는다. Production runtime 의존성 0건과 개발도구 잔여 위험을 분리한다.

- 검사일: 2026-08-24 KST
- 대상: RetailPulse Seoul Sites 원본과 전체 Git 이력
- 공개 저장소: `rudvh1016-gif/retailpulse-korea`
- 최종 판정: `PUBLIC_COMMIT_READY`

## 검사 결과

- 현재 추적 파일과 전체 Git 이력에서 고신뢰 API 키, GitHub 토큰, 클라우드 토큰, 개인키 패턴이 발견되지 않았다.
- `.env`, 인증서, 개인키, 로컬 데이터베이스, 로그, Sites 런타임 캐시는 Git에서 제외된다.
- 이메일 문자열은 베타 신청 폼의 예시 placeholder뿐이며 실제 신청자 데이터는 저장소에 포함되지 않는다.
- 신라면세점 관련 문구는 비공개 매출·재고·인력 데이터가 아니라 공개데이터로 특정 매장 혼잡이나 매출을 확정할 수 없다는 Data Truth 설명이다.
- 사용자 제공 서울 이미지 2장은 기존 Site에 사용하도록 제공된 자산으로 분류했다. 제3자 권리 여부는 저장소가 독립적으로 증명하지 않는다.
- 공식 Historical 데이터는 출처와 Record type을 함께 표시하며, API Key나 비공개 원본 응답을 저장소에 포함하지 않는다.
- 코드 재사용 라이선스는 아직 지정하지 않았다. Public 공개는 제3자에게 자동으로 재사용 권한을 부여한다는 의미가 아니다.

## 의존성 검사

- 최초 검사에서 Next.js 하위 `postcss`, `nanoid`, `sharp` 관련 High 경고 4건을 확인했다.
- `next`와 `eslint-config-next`를 `16.3.2`로 갱신했다.
- 재검사 결과: `npm audit --omit=dev --audit-level=high` 취약점 0건.

## 검증 결과

- `npm ci`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm test`: PASS, 14/14
- Secret 고신뢰 패턴 검사: PASS
- 전체 Git 이력 민감 파일명 검사: PASS
- 실제 `.env` 추적 여부: PASS, 추적하지 않음

## 운영 주의사항

- 실제 API Key는 GitHub Secrets 또는 Production Secret Store에만 저장한다.
- `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`에 비밀키를 넣지 않는다.
- 신라면세점 또는 다른 회사의 내부 매출·재고·인력·고객정보를 이 저장소에 추가하지 않는다.
- 새로운 Raw 데이터나 이미지가 추가될 때는 라이선스와 재배포 조건을 다시 확인한다.
- Secret이 한 번이라도 Public Git 이력에 들어가면 삭제만 하지 말고 즉시 폐기·재발급한다.
