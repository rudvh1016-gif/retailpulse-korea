# 미리 준비 — 검토된 주요 시험·행사 일정

## 범위와 기준

사용자는 미리 준비 달력에 2026년 11월 한국 수능을 넣고, 중국·일본·미국 등 항공편이 많은 국가의 큰 일정도 추가하도록 요청했다. 새 공휴일 서비스 연결, 계정, 결제, API, 수집기 또는 자동 갱신은 추가하지 않는다.

기준 main: `7c424aeed90946c8c03379b054a30a9a1e5e2fbd` (#515 병합). 해당 커밋의 `data/airport-focus-preview/holidays.json`, `calendar-context.json`, `data/official-calendar/priority-country-multiyear.json`, `lib/preparation-calendar.ts`, `app/airport-focus-holidays.tsx`와 #515를 먼저 대조했다. 일본 11/3·11/23, 미국 11/11·11/26 등 기존 공휴일은 재추가하지 않는다.

## 신규 7건 — 2026-10-30 공식 원문 확인

| 국가·지역 | 일정 | 현지 날짜(종료일 포함) | 공식 근거와 확인 범위 |
|---|---|---|---|
| 한국 | 2027학년도 수능 | 2026-11-19 | [교육부 발표](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=100526&lev=0&m=020402&opType=N&s=moe&statusYN=W). 시험일과 성적 통지일을 구분. 공휴일·수능 뒤 여행 기간 아님. |
| 한국 | 2028학년도 수능 | 2027-11-18 | [교육부 발표](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=103512&lev=0&m=020402&s=moe). 시행 연도는 2027년. 세부 교통·항공 대책은 미확정으로 남김. |
| 중국 | 제9회 국제수입박람회 | 2026-11-05~10 | [상하이시 정부](https://english.shanghai.gov.cn/en-Latest-WhatsNew/20260915/b894b1c527a84bf693216ed3d1d336e4.html). 상하이 국가전시컨벤션센터 행사. 개인 참관 11/8~10과 전체 회기를 구분; 중국 전국 휴무 아님. |
| 미국 | 정기 연방 총선거 | 2026-11-03 | [연방선거위원회 FEC](https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/). 주·지역별 투표 운영·휴무는 별도이며 전국 공통 연방 휴무일로 표시하지 않음. |
| 일본 | 2027년도 대학입학 공통테스트 본시험 | 2027-01-16~17 | [대학입시센터 DNC](https://www.dnc.ac.jp/kyotsu/shiken_jouhou/r9/index.html). 1/23~24 추가·재시험과 구분. 공휴일·전국 방학 아님. |
| 대만 | 116학년도 학과능력측험(학측) | 2027-01-22~24 | [CEEC 최종 시험 중요일정 PDF](https://www.ceec.edu.tw/files/file_pool/1/0q215602074068375626/116%E5%AD%B8%E5%B9%B4%E5%BA%A6%E8%80%83%E8%A9%A6%E9%87%8D%E8%A6%81%E8%A9%A6%E5%8B%99%E6%97%A5%E6%9C%9F.pdf) 숫자 행과 [공립 관음고등학교 안내](https://www.gish.tyc.edu.tw/p/16-1000-19726.php), [국립 신영고공 안내](https://www.hyivs.tn.edu.tw/ischool/widget/main_menu/show.php?id=1754&map=0) 대조. 민국 116=2027년. 잠정 5월 표 대신 최종 시험일정 PDF 사용. |
| 홍콩 | 2027 홍콩 마라톤 | 2027-01-17 | [홍콩 정부 Brand Hong Kong](https://cms.brandhk.gov.hk/en/mega-event/what%27s-on-in-hong-kong?cat=Standard+Chartered+Hong+Kong+Marathon+2027), [주최 측](https://www.hkmarathon.com/zh-hant/race-information/) 대조. 홍콩 대회 구간에 한정; 전체 휴무 아님. |

이 자료는 날짜·대상 확인이며 한국 도착일, 운항편수, 여객수, 매출 또는 혼잡의 증감 예측이 아니다. 2026년 수능 듣기평가 운항 통제 시각이나 시험 뒤 여행 급증 기간을 임의로 만들지 않았다. 공식적으로 발표된 날짜만 저장하며 연도별 반복 생성은 하지 않는다.

## 항공편 많은 국가·지역 누락 방지 검토

`docs/COUNTRY_VOLUME_ORDER_20261012.md`의 당시 T2 월중 실적 JP/CN/US/VN/TH/TW/PH를 참고하고 HK/SG도 추가 대조했다. 이 과거 표를 현재의 전체 공항 순위라고 부르지 않는다. 아래는 대표 일정·추가 판단이며 각 나라의 모든 행사·휴일을 조사했다는 뜻이 아니다.

| 국가·지역 | 기존 일정 및 이번 판단 |
|---|---|
| JP | 기존 문화의 날·근로감사의 날 보존, [내각부 2026·2027 공휴일표](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)와 대조. 공통테스트 추가. |
| CN | 기존 공표 조정휴무 보존, [국무원 2026 연간 공고](https://www.gov.cn/zhengce/content/202511/content_7047090.htm) 확인. 11월 전국 연휴를 만들지 않고 상하이 박람회만 범위 제한 추가. 2027 가오카오 날짜를 전년도 관행으로 생성하지 않음. |
| US | 기존 [OPM 연방공무원 휴일](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/)의 11/11·11/26 및 지역별 괌·사이판·하와이 범위 보존. 총선거만 별도 주요일정으로 추가. 블랙프라이데이를 연방 휴일로 추가하지 않음. |
| VN | 기존 11/24 문화의 날 보존. [정부의 결의 28/2026/QH16 설명](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-28-2026-qh16-ve-phat-trien-van-hoa-viet-nam-119260508142130402.htm) 제2조 재대조. 중복 추가 없음. |
| TH | 기존 BOT 금융기관 휴일과 2025~2027 검토본 보존. [BOT 공식 휴일 안내](https://www.bot.or.th/en/financial-institutions-holiday.html) 및 [기존 2026 공고 PDF](https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf) 확인. 금융기관 휴일을 전국 민간 휴무로 확대하지 않으며 지역 축제 날짜를 태국 전체 휴무로 만들지 않음. |
| TW | 기존 신정 보존, CEEC 학측 추가. 전국 학교 공통 방학으로 변환하지 않음. |
| PH | 기존 11/1~2, 12/24~25 대표 일정 보존. [대통령 포고 1006 공식 첨부본](https://omcrs.nia.gov.ph/?q=system%2Ffiles%2Fmc%2F2025_089.pdf) 대조. 모든 공휴일을 수록한 달력이 아니며 학교별 방학·선거 일정을 추정해 추가하지 않음. |
| HK | 기존 성탄절·신정 보존. 정부·주최 측 모두 확인된 마라톤만 추가. 비공식 WinterFest 날짜 패턴은 제외. |
| SG | 기존 11/8 디파발리·조건부 11/9·성탄절·신정 보존, [MOM](https://www.mom.gov.sg/employment-practices/public-holidays) 대조. 조건부 대체휴일을 전 국민 공통 연휴로 바꾸지 않음. MOE 방학 보도자료는 JavaScript 확인 화면으로 원문 읽기가 차단되어 이번 전국 방학 신규 항목에서는 제외. |

## 구현 경계

- `data/reviewed-major-events.json`은 별도 수동 검토본, `automaticCollectionEnabled: false`.
- `PreparationEvent.kind`에만 `major_event`를 추가. 공휴일 API/공유 `CalendarEvent` 스키마/휴일·노선 추론/항공편 계산에는 입력하지 않는다.
- 기존 달력과 국가 필터를 재사용. 전체 미리 준비 화면의 달력 및 90일 설명에 표시하고, ‘다가오는 국가별 휴일’ 소형 카드에는 섞지 않는다.
- 확인일이 기준일보다 뒤인 항목은 표시하지 않는다. 검토일·원문·대상 범위·주요일정(공통 휴무 아님)을 보존한다.
- 신규 표시 문구의 중국어 검토 번역 추가. 기존 타 언어 화면 정책과 숫자·계산·수집일 표시를 바꾸지 않는다.
- 데이터·표시만 변경. 새 API·계정·결제·수집기·DB·스케줄·의존성·배포 절차 변경 없음. 런타임 공식 사용량/무료 한도 안전성은 이 변경으로 확인되었다고 주장하지 않는다.

## 검증 및 남은 경계

검증 명령·실제 결과와 원격 정확한 HEAD/CI/배포 상태는 이 문서와 연결된 PR 본문·댓글에 기록한다. 로컬 브라우저는 Chromium의 Unix socket 생성이 EPERM으로 실패하여 앱 assertion 이전에 차단됨. 권한 승격이나 우회를 하지 않으며 브라우저 통과로 표시하지 않는다. 추가한 390/1440px 브라우저 회귀는 원격 CI에서 검증해야 한다.

## 추가 요청 — 미리 준비 설명 간결화

`IMG_1713.png`를 직접 확인했다. 네팔 일정에 관보 쪽수·BS/AD 변환 과정 등 내부 연구 로그가 노출된 문제였다. 모든 국가에 같은 표시 규칙을 적용한다.

- 달력 날짜 선택 상세와 전체 90일 목록은 핵심 의미 한 문장·날짜만 먼저 표시한다.
- 적용 대상·공식 출처는 기본 닫힌 네이티브 details에 모은다. 지역·기관 범위, 설명의 나머지 실제 유의사항, 휴무 연결 조건, 확인일과 공식 링크는 보존한다.
- notes 원문을 그대로 렌더링하지 않는다. JSON 원본과 연구 증빙은 삭제하지 않는다. 조정휴무의 보충근무일은 구조가 확인되는 날짜 부분만 재사용하여 휴일로 오인하지 않게 한다.
- 중국 박람회 개인 참관일·등록 조건과 일본 본시험/추가시험 구분은 별도 displayConditions_ko에 명시하여 내부 로그 없이도 실무 조건을 유지한다.
- 폰트·색상·여백·계산·수집기·API는 변경하지 않는다. #515의 한눈에 안내와는 별개이며 병합된 변경을 보존한다.
