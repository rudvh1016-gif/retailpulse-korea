# RetailPulse Seoul V5 — 100-Point QA Report

- 검사 기준일: 2026-08-23 KST
- 대상: V5 Work Site, 390px mobile, desktop, KO/EN/ZH-CN/JA, Airport/Business/SEO
- 데이터 원칙: 화면 기능의 정상 여부와 데이터의 Live 여부를 분리했다. Live API 미연결 값은 계속 `DEMO DATA`, 공식 과거값은 `OFFICIAL HISTORICAL`로 표시한다.
- 상태 집계(최종): **PASS 99 / FAIL 0 / BLOCKED 1**
- 남은 `BLOCKED` 1건은 Work의 공통 root layout 때문에 최초 서버 `<html lang>`을 locale별로 다르게 출력할 수 없는 플랫폼 한계다. Client hydration 후에는 4개 언어가 정확하다.

## DESIGN 1–10

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 1 | AI Card 과다 제거 | PASS | KPI 박스 반복을 Editorial row, divider, open section으로 전환 |
| 2 | Gradient 제거 | PASS | 화면 장식용 gradient 0건 |
| 3 | Shadow 최소화 | PASS | 일반 surface shadow 제거, modal 등 필요한 elevation만 유지 |
| 4 | Radius 절제 | PASS | 일반 surface 10–14px 이하, open section은 radius 없음 |
| 5 | Pill 절제 | PASS | 상태·선택처럼 의미 있는 control에만 사용 |
| 6 | Blue 남발 제거 | PASS | Cobalt는 활성 control/핵심 링크 중심, 주요 숫자는 중립색 |
| 7 | Font 교체 | PASS | Pretendard Variable + Noto Sans JP/SC fallback 및 swap 적용 |
| 8 | Typography hierarchy | PASS | 400/500/600 중심, tabular numeric, 반응형 primary metric |
| 9 | Editorial spacing | PASS | 넓은 여백, 얇은 divider, 서로 다른 section rhythm 확인 |
| 10 | 이미지와 Data 균형 | PASS | Hero 35–45vh 이하, Pulse/ranking이 이미지보다 먼저 읽힘 |

## MOBILE 11–20

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 11 | iPhone Home 정상 | PASS | 390×844에서 Hero, ranking, nav 확인 |
| 12 | Forecast 정상 | PASS | 7-day strip와 수치 잘림 없음 |
| 13 | Airport 정상 | PASS | T1/T2, passenger, search, history 순서 정상 |
| 14 | Business 정상 | PASS | score, 6업종, opening brief 정상 |
| 15 | More 정상 | PASS | preference, source, FAQ, language 정상 |
| 16 | Bottom Nav Safe Area | PASS | `env(safe-area-inset-bottom)` 적용, 콘텐츠 비가림 |
| 17 | 가로스크롤 없음 | PASS | document-level overflow 0; 내부 strip만 의도적 scroll |
| 18 | Long number overflow 없음 | PASS | 9–99,999,999 범위용 responsive metric와 overflow-wrap 확인 |
| 19 | Chart overflow 없음 | PASS | mobile width 내 chart/strip rendering 확인 |
| 20 | Touch target 정상 | PASS | tab/filter/language control 최소 44px 기준 적용 |

## LANGUAGE 21–30

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 21 | 한국어 | PASS | Home/Forecast/Airport/Business/More 문구 확인 |
| 22 | English | PASS | navigation, count/date, core labels 확인 |
| 23 | 简体中文 | PASS | navigation, count/date, Airport/Business 문구 확인 |
| 24 | 日本語 | PASS | 5개 nav, Airport, 6업종, More, 404까지 정식 적용 |
| 25 | 일본어 Font | PASS | `lang=ja`에서 Noto Sans JP 우선 fallback |
| 26 | 중국어 Font | PASS | `lang=zh-CN`에서 Noto Sans SC 우선 fallback |
| 27 | 날짜 번역 | PASS | KO/EN/ZH/JA formatter와 KST label 분리 |
| 28 | 숫자 Formatter | PASS | Count K/M/B 0건, KO/EN/JA exact comma, ZH 자연 단위+상세 |
| 29 | Navigation 번역 | PASS | KO/EN/ZH/JA 5개 bottom nav 폭 확인 |
| 30 | Language persistence | PASS | localStorage 저장, route 유지, browser back 확인 |

## AIRPORT 31–40

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 31 | 전체 | PASS | ALL current/demo와 official history 표시 |
| 32 | T1 | PASS | 공식 terminal history와 demo N/A 처리 |
| 33 | T2 | PASS | 공식 terminal history와 demo N/A 처리 |
| 34 | 출발 | PASS | flight direction filter 작동 |
| 35 | 도착 | PASS | flight direction filter 작동 |
| 36 | Airline | PASS | KE/대한항공/Korean Air 등 alias 구조 및 watcher 작동 |
| 37 | Flight search | PASS | KE703 검색에서 T2 result 1건 확인 |
| 38 | 1H/3H/6H Wave | PASS | airline/route flight-count aggregation과 기간 전환 작동 |
| 39 | Historical | PASS | 6M/12M/ALL, exact monthly counts, daily average 표시 |
| 40 | T1/T2 N/A 처리 | PASS | 전체 Demo 값을 터미널로 배분하지 않고 명시적 N/A |

## BUSINESS 41–50

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 41 | 명동 | PASS | area selection과 brief 갱신 |
| 42 | 홍대 | PASS | area selection과 brief 갱신 |
| 43 | 성수 | PASS | area selection과 brief 갱신 |
| 44 | 뷰티 | PASS | 4개 언어 label/action 제공 |
| 45 | 패션 | PASS | 4개 언어 label/action 제공 |
| 46 | 식음료 | PASS | 4개 언어 label/action 제공 |
| 47 | 편의점·약국 | PASS | 4개 언어 label/action 제공 |
| 48 | 팝업·체험 | PASS | 4개 언어 label/action 제공 |
| 49 | 관광·숙박 | PASS | 4개 언어 label/action 제공 |
| 50 | Opening Brief | PASS | deterministic template, 매출 확정 표현 없음 |

## DATA 51–60

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 51 | Official Historical | PASS | 인천공항 월별 실제값과 source/period 표시 |
| 52 | Demo | PASS | Today/Forecast/flight sample에 명시 |
| 53 | Forecast | PASS | target date와 예측 label 분리 |
| 54 | Live | PASS | Live 미연결을 Live라 주장하지 않으며 상태 계약 존재 |
| 55 | Backfill | PASS | Official historical/backfill과 prospective 분리 설명 |
| 56 | Source | PASS | 카드/상세 및 Data Catalog에서 source 확인 가능 |
| 57 | Updated time | PASS | 기준일·업데이트·KST 표시 |
| 58 | Partial period | PASS | 미완료 월은 full month와 직접 비교하지 않는 계약 |
| 59 | Missing data | PASS | T1/T2 N/A, history gap, no-flight state 제공 |
| 60 | Data Health | PASS | 6/7 demo health와 source-level state 확인 가능 |

## TRUTH 61–70

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 61 | 항공편수 ≠ 승객수 | PASS | Wave는 `편`, passenger는 `명`으로 분리 |
| 62 | 목적지 ≠ 국적 | PASS | route label과 truth note 유지 |
| 63 | 항공사 ≠ 국적 | PASS | airline intelligence에 국적 추론 없음 |
| 64 | 방문자 ≠ 관광객 | PASS | Data Truth에 명시 |
| 65 | 내국인 카드 ≠ 외국인 소비 | PASS | Data Truth에 명시 |
| 66 | Naver ≠ 판매액 | PASS | 상대 관심도 후보변수로만 설명 |
| 67 | D-4 ≠ Realtime | PASS | source lag와 realtime 분리 |
| 68 | Backfill ≠ Prospective | PASS | `recordOrigin` 및 Harness 규칙 명시 |
| 69 | Actual ≠ Forecast | PASS | Official history와 forecast surface/label 분리 |
| 70 | T1/T2 임의배분 없음 | PASS | Demo current는 terminal N/A, official terminal totals만 사용 |

## SEO 71–80

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 71 | Unique title | PASS | 4 locale × 8 page metadata map |
| 72 | Meta description | PASS | locale/page별 실제 기능 기반 description |
| 73 | H1 | PASS | main view당 1개 중심 heading |
| 74 | Heading hierarchy | PASS | H1→H2→H3 semantic order 점검 |
| 75 | lang | BLOCKED | Client hydration 후 ko/en/zh-CN/ja는 정확하나 Work의 공통 root layout 때문에 최초 서버 `<html lang>`은 ko. Production locale root layout 필요 |
| 76 | hreflang | PASS | ko/en/zh-CN/ja/x-default alternates metadata 적용 |
| 77 | canonical | PASS | locale/page별 자기 canonical 적용 |
| 78 | sitemap | PASS | 4개 언어 × 8개 의미 있는 URL, filter/flight row 제외 |
| 79 | robots | PASS | public page 허용, 기술 문서·debug noindex 경로 안내 |
| 80 | internal linking | PASS | Home↔area/Airport, footer methodology/source link 확인 |

## SEO / PERFORMANCE 81–90

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 81 | Open Graph | PASS | title/description/image/url/type와 Twitter card 적용 |
| 82 | alt text | PASS | 사용자 제공 이미지 A/B 4개 언어 의미형 alt |
| 83 | semantic HTML | PASS | main/nav/section/heading/button/link/table 사용 |
| 84 | 404 | PASS | KO/EN/ZH/JA localized 404와 복귀 링크 제공 |
| 85 | broken links | PASS | 내부 route, language route, public docs 존재 확인 |
| 86 | image size | PASS | 원본 451KB/190KB, width/height 고정; production AVIF/WebP handoff |
| 87 | font loading | PASS | `font-display: swap`, 400/500/600 중심; production self-host 지침 |
| 88 | CLS | PASS | 이미지 dimension/aspect-ratio, chart height, fixed nav 여백 적용 |
| 89 | initial JS/data load | PASS | 작은 summary/demo aggregate만 포함, full raw/history 없음 |
| 90 | duplicate/thin pages | PASS | 실제 기능 8종만 index, flight/filter 자동 page 미생성 |

## PRODUCT / BUG 91–100

| # | 검사 | 상태 | 확인 결과 |
|---:|---|---|---|
| 91 | Opening Brief | PASS | Home와 Business deterministic brief |
| 92 | What Changed | PASS | Demo badge와 비교 항목 제공, Live인 척하지 않음 |
| 93 | My RetailPulse | PASS | area/terminal/airline/industry/language local preference |
| 94 | My Airport | PASS | watched airlines toggle/persistence |
| 95 | Why This Number | PASS | 5 signals, confidence, data health details |
| 96 | Historical Compare | PASS | official monthly/daily average/MoM와 T1/T2 share insight |
| 97 | Global Search | PASS | area/flight/airline/business/T1/T2 분류 검색 |
| 98 | LocalStorage failure | PASS | read/write 전부 try/catch, 차단 시 in-memory defaults |
| 99 | Network/API error | PASS | partial-source/state preview, historical 독립, no-flight state |
| 100 | Production Build / final publish | PASS | TypeScript·lint·production build·7개 rendered test 통과, V5 version 9 배포가 `succeeded`인지 직접 재확인 |

## Bug Attack 결과

- T1/T2 현재 Demo 없음: 임의 수치 대신 `—`와 N/A 설명.
- T2 + 출발 + KE + 3시간 + 지연: 0건 결과에서도 filter 유지 및 일본어 empty state 정상.
- KE703: T2, 항공사, 상태, gate/check-in sample row 정상.
- Flight 0건/다수: list가 fixed board가 아니며 빈 상태와 progressive list 유지.
- 긴 일본어/중국어/항공사명: 일본어 `관광·숙박` Opening Brief에서 110px 가로 넘침을 발견해 locale별 word-break/overflow-wrap을 수정했고, 3개 지역과 중국어를 재검증했다.
- History gap/partial month/no forecast/network failure: 데이터 종류별 독립 state와 안내 제공.
- 99,999,999: responsive numeric typography 및 comma formatter로 overflow 방지.

## 추가 Code Audit

- `npx tsc --noEmit`: Cloudflare Worker의 `Fetcher`, `D1Database`, `cloudflare:workers` 타입 누락을 발견했다. 최소 Runtime declaration을 추가해 TypeScript 검사를 통과시켰으며, Production은 Wrangler 생성 타입으로 교체하도록 명세했다.
- `npm run lint`: PASS.
- `npm test`: PASS · production build + rendered HTML 7개 테스트.
- `git diff --check`: PASS.
- 앱 코드의 사람 수·편수·금액 `K/M/B` 축약: 0건. `6M/12M`은 기간 selector에만 사용한다.
- Preview Console: Site Runtime error 0건. 브라우저 검사 확장 프로그램 자체 metadata 오류는 제품 코드에서 발생한 오류가 아니다.

## 추가 Gate / Retail Intelligence 감사

| 검사 | 상태 | 확인 결과 |
|---|---|---|
| 공식 T1 출국장 대기 API | PASS | 출국장 1~6번·동서측·1분 대기인원 필드와 Key 조건 확인 |
| T2 출국장 Data Truth | PASS | 공식 설명상 추후 제공 예정으로 문서·UI에 `N/A` 계약 반영 |
| Flight gate/check-in/status | PASS | D-3~D+6 공식 운항 상세 Source와 필드 확인 |
| 면세시설 위치·영업시간 | PASS | 공식 Directory를 위치·운영정보 Source로만 분리 |
| 면세점별 실제 유동·매출 | PASS | 공개 Source 없음으로 `NOT AVAILABLE`; 추정값을 실제값처럼 표시하지 않음 |
| Gate Wave 결항 처리 | PASS | 코드 재검토에서 결항편이 집중 편수에 포함될 수 있던 결함을 발견해 제외 |
| TODAY 시간범위 | PASS | 08:00 이전 편이 빠지던 결함 수정; TODAY는 하루 전체, 1H/3H/6H만 기준시각 이후 |
| Gate zone mobile layout | PASS | open editorial row, 1-column capability/summary 전환, 긴 4개 언어 문장 wrap 적용 |
| Store footfall 오인 방지 | PASS | `DEMO GATE WAVE`, `OFFICIAL DIRECTORY`, `NOT STORE FOOTFALL` 경계 표시 |

상세 근거와 Production 산식: [Gate & Retail Data Audit](/gate-retail-data-audit.md)

## 남은 Production 조치

1. locale별 server root layout으로 최초 HTML `lang`을 정확히 출력한다.
2. 실제 P0 API Secret을 Worker/GitHub Secret에 넣고 Demo surface를 교체한다.
3. custom domain, Search Console, 301 migration은 Production에서 수행한다.
4. Prospective archive가 쌓이기 전 Forecast Performance/자가학습 성과를 주장하지 않는다.

## 최종 게시 확인

- URL: `https://retailpulse-seoul.rudvh1016.chatgpt.site`
- Deployment status: `succeeded`
- 확인시각: 2026-08-23 KST
