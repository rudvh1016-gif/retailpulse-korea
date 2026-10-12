# Selected-month destination volume TOP8

T2, October 2026 MTD through October11 (11 included days), public monthly response captured October12 15:43 KST: JP82.5, CN52.1, US26.5, VN20.0, TH10.2, TW9.5, PH8.6, KR6.1 flights/day. US is third:292/11=26.5454545…; the mapping and source bucket exist. The previous month has30 included days. These denominators and comparison values are unchanged.

The old shared rows were ordered by absolute side-change magnitude, so the first8 were JP,CN,VN,TH,PH,TW,MN,HK. The compact card component now sorts all rows by the selected month's unrounded daily mean before slicing8. Positive counts precede0,0 precedes unavailable, and exact ties use ISO country code order. Expanded rows use exactly the same order. US is not pinned. The underlying shared change calculator remains unchanged, including the separate glance growth Top5.

Only the compact component imports a new pure ordering helper; title labels name TOP8 in all4 languages. No collection, monthly aggregation, source mapping, rate, zero-baseline rule or denominator changes. Existing show-more and collapse actions remain. The separate domestic-label PR352 is not included; its KR naming change can coexist with this ordering change.

## Evidence
- [T2 mobile390](screenshots/country-volume-order-20261012/top8-T2-390.png)
- [T2 desktop1440](screenshots/country-volume-order-20261012/top8-T2-1440.png)
- [Browser evidence](screenshots/country-volume-order-20261012/evidence.json)

Checks: new ordering2 + font2 PASS; existing monthly/country8 PASS; typecheck PASS; scoped lint0 errors/one existing static flag-img advisory; UI-lock unchanged PASS; native production build PASS; top-eight browser4 PASS at360/390/430/1280 including keyboard expand/collapse and unchanged share definitions. Actual-source PC/mobile captures verify all8, US26.5, entire expanded order, no horizontal overflow/page errors. Git diff and committed-file secret checks are recorded on the draft PR. No merge or deployment.

Component captures hide only fixed/sticky application chrome so it cannot obscure the ranked cards; card layout, text and values are unchanged.
