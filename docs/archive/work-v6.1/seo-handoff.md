# RetailPulse Seoul — SEO Handoff V5

> V6.1 naming: use `RetailPulse Korea` as the umbrella brand and `RetailPulse Korea · Seoul` for current coverage. Do not publish nationwide landing pages until unique regional data and content exist. Current core intent is “Seoul foreign shopping demand / tomorrow / store opening brief”, with airport pages remaining supporting utilities.

## V6.1 indexable product pages

- Today/area pages: explain AREA PULSE vs FOREIGN SHOPPING SIGNAL and answer where/when.
- Business: tomorrow signal, why, opening brief, actions, history and collecting track record.
- Insights: Forecast Lab, target registry, baselines, FAST/DEEP definitions and honest zero-state.
- Airport: T1/T2, flights and official history; no mass flight/gate pages.
- Methodology/data: crawlable trust content; operational handoff and QA documents should be noindex in independent production.

The `.com` migration requires exact 301s, self-canonicals, four-locale hreflang, sitemap replacement and Search Console change-of-address. Do not redirect a `/ja/` entry to Korean based on browser language.

기준일: 2026-08-23 KST  
Work URL: `https://retailpulse-seoul.rudvh1016.chatgpt.site`

## 1. 원칙

RetailPulse의 SEO 자산은 대량 생성 글이 아니라 고유 데이터다. 검색 Landing은 실제 Pulse, 추천시간, 공식 History, T1/T2, Airline Intelligence, Business Opening Brief가 있는 페이지로 제한한다. 실시간 Flight row, 검색 Query, filter 조합, QA/Handoff 문서는 색인하지 않는다.

## 2. 구현 상태

| 항목 | 상태 | Work 적용 |
|---|---|---|
| Locale route | `PASS` | `/ko`, `/en`, `/zh`, `/ja` |
| Area/Airport/Business route | `PASS` | 의미 있는 7개 slug × 4 locale |
| Unique title/description | `PASS` | `generateMetadata` 기반 |
| Canonical | `PASS_ON_WORK` | locale/slug 자기참조 |
| hreflang | `PASS_ON_WORK` | `ko-KR`, `en`, `zh-CN`, `ja-JP`, `x-default` |
| Open Graph/Twitter | `PASS_ON_WORK` | 사용자 제공 Primary Seoul image 사용 |
| robots.txt | `PASS` | 기술문서·QA 문서 제외 |
| sitemap.xml | `PASS` | 32개 의미 있는 URL만 포함 |
| Structured data | `PASS_ON_WORK` | WebSite + WebApplication |
| Semantic H1/H2/H3 | `PASS` | 각 View H1 1개 중심 |
| 404 | `PASS` | locale 감지, Home/Area/Airport 링크 |
| Server `<html lang>` per locale | `WORK_PLATFORM_LIMIT` | Client가 즉시 교체하나 server shell은 `ko`; Production route layout 필요 |
| Custom domain | `HANDOFF_REQUIRED` | 독립 Production 도메인 결정 필요 |
| Search Console/Bing | `HANDOFF_REQUIRED` | 소유권 검증과 sitemap 제출 필요 |
| 301 domain migration | `HANDOFF_REQUIRED` | chatgpt.site에서 독립 도메인으로 이동할 때 적용 |

## 3. Page Map

| URL pattern | H1/주요 답 | Index |
|---|---|---|
| `/{locale}` | 오늘/내일 서울 지역 순위 | Yes |
| `/{locale}/myeongdong` | 명동 Pulse·추천시간·Why·Brief | Yes |
| `/{locale}/hongdae` | 홍대 Pulse·추천시간·Why·Brief | Yes |
| `/{locale}/seongsu` | 성수 Pulse·추천시간·Why·Brief | Yes |
| `/{locale}/forecast` | 7일 수요예측·지역비교·신뢰도 | Yes |
| `/{locale}/airport` | 전체/T1/T2·Today/Tomorrow·History·Flights | Yes |
| `/{locale}/business` | 6업종 Opening Brief·Historical Signal | Yes |
| `/{locale}/more` | Data Source·Methodology·FAQ·Data Health | Yes |
| Flight/filter/search state | 사용자 도구 | No standalone pages |
| `*.md`, QA, Handoff | 개발문서 | robots disallow / Production noindex |

## 4. 대표 Title / Description / H1

### Home

| Locale | Title | H1 |
|---|---|---|
| KO | 서울 쇼핑·관광 수요 예측 \| RetailPulse Seoul | 내일 서울은 어디가 좋을까요? |
| EN | Seoul Shopping Demand & Airport Pulse \| RetailPulse | Where should you go in Seoul tomorrow? |
| ZH | 首尔购物需求与仁川机场信息 \| RetailPulse | 明天去首尔哪里比较好？ |
| JA | ソウル買い物需要・仁川空港情報 \| RetailPulse | 明日のソウル、どこへ行く？ |

### Myeongdong

| Locale | Title |
|---|---|
| KO | 명동 오늘·내일 쇼핑 수요 및 추천시간 \| RetailPulse |
| EN | Myeongdong Shopping Demand & Best Time \| RetailPulse |
| ZH | 明洞今日明日购物需求与推荐时间 \| RetailPulse |
| JA | 明洞の混雑・買い物需要とおすすめ時間 \| RetailPulse |

### Airport

| Locale | Title |
|---|---|
| KO | 인천공항 T1·T2 출국객·항공편·혼잡도 \| RetailPulse |
| EN | Incheon Airport T1·T2 Passengers & Flights \| RetailPulse |
| ZH | 仁川机场T1·T2出境旅客与航班 \| RetailPulse |
| JA | 仁川空港T1・T2 出国者・フライト・混雑 \| RetailPulse |

Description은 70–160자 범위의 자연스러운 문장으로 실제 제공값만 설명한다. Demo 예측을 Live처럼 쓰지 않는다.

## 5. Canonical / hreflang 계약

각 `/{locale}/{slug}`는 자기 자신을 canonical로 둔다. 동일 slug의 4개 언어를 서로 연결한다.

```html
<link rel="canonical" href="https://{domain}/ja/myeongdong">
<link rel="alternate" hreflang="ko-KR" href="https://{domain}/ko/myeongdong">
<link rel="alternate" hreflang="en" href="https://{domain}/en/myeongdong">
<link rel="alternate" hreflang="zh-CN" href="https://{domain}/zh/myeongdong">
<link rel="alternate" hreflang="ja-JP" href="https://{domain}/ja/myeongdong">
<link rel="alternate" hreflang="x-default" href="https://{domain}/en/myeongdong">
```

필터 Query는 canonical을 base route로 유지한다. locale URL 방문자를 브라우저 언어로 다른 locale에 강제 redirect하지 않는다.

## 6. robots / Sitemap

Work의 `public/robots.txt`와 `public/sitemap.xml`을 Production origin으로 교체한다.

- 허용: Home, 3 Area, Forecast, Airport, Business, More × 4 locale.
- 제외: 기술문서, QA, debug/test, filter/search Query, Flight row.
- Sitemap의 `lastmod`는 데이터 업데이트가 아니라 페이지 콘텐츠가 실제 변경된 때에만 갱신한다.
- Flight 수천 건이나 얇은 Airline page를 Sitemap에 넣지 않는다.

## 7. Structured Data

현재 Work는 실제 내용에 맞는 `WebSite`와 `WebApplication`만 제공한다. Production 후보:

- Root: `WebSite`, `WebApplication`, 필요 시 `Organization`.
- 깊은 route: `BreadcrumbList`.
- `/more`: 화면에 실제 표시되는 5개 FAQ와 동일할 때만 `FAQPage`.

금지: 실제 Review가 없는 Rating/Review, 단순 지역 Pulse를 TouristAttraction로 표시, Demo Event를 Event schema로 표시.

## 8. Open Graph / Image

- Work OG는 사용자 제공 `/assets/seoul-hangang.jpeg`를 사용한다.
- Production에서 원본을 훼손하지 않고 1200×630 social crop을 만든다.
- 남산서울타워·한강·다리가 남도록 focal crop을 검증한다.
- 이미지 안에 언어별 문구를 굽지 않는다.
- Primary: preload/AVIF/WebP/srcset/sizes/width/height.
- Secondary: lazy-load/AVIF/WebP/width/height.
- alt는 locale별 자연스러운 설명으로 유지하고 키워드 반복을 금지한다.

## 9. Render / Language Handoff

현재 Work의 locale route는 metadata와 body 콘텐츠가 server-render되지만 root layout의 `<html lang>`은 `ko`로 시작하고 hydration 후 `en`, `zh-CN`, `ja`로 교체된다. 독립 Production에서는 아래 중 하나로 해결한다.

1. Locale segment를 root-level route group/build로 분리해 locale별 Document/HTML을 server에서 생성.
2. Framework가 지원하는 request-locale middleware와 server layout을 사용하되 locale URL을 source of truth로 유지.
3. HTML snapshot 테스트로 `/ja/* → lang=ja`, `/zh/* → lang=zh-CN`을 검사.

이 항목이 해결되기 전 `server lang PASS`로 표시하지 않는다.

## 10. Internal Links / Breadcrumb

- Home → 세 Area / Airport / Business.
- Area → 다른 Area 비교 / Forecast / Airport.
- Airport → T1/T2 상태 / Business 참고.
- More → Methodology / Data Sources.
- Production에서 깊은 route에 작은 `RetailPulse > Airport > T2` breadcrumb를 추가하되 T1/T2 filter state를 얇은 SEO page로 자동 생성하지 않는다.

## 11. 404 / Redirect

- 잘못된 URL은 빈 화면 대신 locale-aware 404와 Home/3 Area/Airport 링크를 제공한다.
- 독립 도메인 전환 시 모든 의미 있는 Work URL을 동일 locale/slug로 301한다.
- `/ja/myeongdong → https://new-domain/ja/myeongdong`처럼 의미가 유지되어야 한다.
- 301 배포 후 canonical·sitemap·Search Console 주소변경을 같은 Release에서 실행한다.

## 12. Performance SEO

- LCP: Primary image responsive preload, font subset, critical CSS.
- CLS: 두 사용자 이미지와 Chart container에 고정 크기.
- INP: Global Search/filters는 무거운 library 없이 유지.
- Home에서 12M/ALL History, 전체 Airline/Flight를 선로딩하지 않는다.
- Route data를 Summary → interaction load로 분리한다.
- 목표는 실제 RUM으로 정하고, Lab 점수만으로 완료 처리하지 않는다.

## 13. Search Console / Measurement

Production에서 다음을 연결한다.

- Google Search Console, Bing Webmaster.
- Sitemap submit, index coverage, canonical selected, hreflang 오류.
- Organic impressions, clicks, CTR, average position.
- locale별 traffic, Area/Airport/Business landing 성과.
- Core Web Vitals와 404/broken-link 로그.
- 검색성과 때문에 얇은 자동 페이지를 만들지 않는다.

## 14. Release Gate

1. 모든 indexable route가 HTTP 200, 고유 title/description/H1을 갖는다.
2. server HTML의 locale text와 `<html lang>`가 일치한다.
3. canonical/hreflang가 독립 Production origin을 가리킨다.
4. robots와 Sitemap에 기술문서·filter·Flight row가 없다.
5. OG image 1200×630 crop이 4개 locale에서 안전하다.
6. 404는 noindex이며 locale 링크를 유지한다.
7. Search Console URL 검사에서 rendered content와 canonical이 확인된다.

## 15. V5.5 IA와 SEO 연결

- Bottom Navigation 표시명은 Forecast에서 `INSIGHTS`로 확장했지만 기존 `/forecast` URL은 보존했다.
- `/forecast`의 Title/Description은 7일 예측뿐 아니라 지역 비교·What Changed·T1/T2 공식 History를 실제 본문과 일치하게 갱신했다.
- Home Summary가 상세 콘텐츠를 대체하지 않는다. Area, Airport, Business, Forecast route에는 검색 사용자가 이해할 수 있는 설명·비교·Data Truth가 남아 있다.
- `NOW/NEXT/FLIGHTS/HISTORY/AIRLINES` 같은 Airport UI state는 검색 Landing을 대량 생성하지 않는다. Indexable Airport URL은 현재 `/[locale]/airport` 하나이며 Product context를 Progressive Disclosure로 제공한다.
- 향후 `/insights`를 정식 URL로 선택할 경우 `/forecast → /insights` 301, canonical, hreflang, sitemap, Search Console migration을 같은 Release에서 수행한다.
- Feature Map과 V5.5 QA 문서는 검색 Landing이 아니므로 robots noindex 대상에 추가했다.
