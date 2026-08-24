# RetailPulse Korea public release manifest

## Public safe

- 애플리케이션 Source code
- KO / EN / ZH-CN / JA 다국어 UI
- 명동·홍대·성수 Area UI
- Airport 전체 / T1 / T2, Flight Search, Flight Wave, Historical UI
- Business 6개 업종 UI
- Opening Brief, What Changed, My RetailPulse, My Airport, Why This Number
- 공식 Historical 표시용 데이터와 Data Truth 설명
- SEO 파일과 공개 Handoff 문서
- 테스트와 Build 설정
- V6.1 Forecast/Outcome 계약, No-Leakage·Zero-Cost 정책, 경쟁사 감사와 60-point QA
- 사용자 제공 서울 이미지 2장
- `.openai/hosting.json`의 Sites project 식별자와 논리적 binding 이름

## Git에서 제외

- `.env`와 실제 Secret
- API Key와 Access Token
- `node_modules`, `dist`, `.next`, coverage
- `.wrangler`, `.sites-runtime`
- 로컬 D1/SQLite 데이터
- 로그와 캐시
- 개인 계정정보
- 베타 신청자의 실제 이메일 데이터
- 회사 내부 매출·재고·인력·고객자료
- 비공개 Raw API 응답

## 추가 검토가 필요한 향후 파일

- 출처나 라이선스가 새로 확인되지 않은 Raw 데이터
- 제3자 이미지와 지도 데이터
- 상업적 재배포 조건이 불명확한 API 응답
- 실제 매장 Outcome 데이터
- 외부 파트너가 제공한 데이터
