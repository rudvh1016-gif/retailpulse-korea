# Shopping chart order and store sales-share labels

Owner request: restore chronological 2024 → 2025 → 2026 order in the industry card-count chart, explain the five-category share, and remove the apparent missing-data dash. Base: `5ca3d518e9c64f3369d2a72b43264769faad9d37` (PR #569). Work is isolated from the airport briefing and share-button changes.

## Causes and correction

- The six industry groups and legend had deliberately placed 2024 last as a reference. Restore chronological DOM/reading order in all six groups and the legend, while keeping the exact values and bars. 2024 remains the 100 baseline; 2025 remains `100 + published growth`; 2026 remains unavailable, without a fabricated zero/bar.
- The apparent dash after “5개 품목 전체 비중” was `content:'−'` on an open native `details` element, not a missing value. The thirty September values were already present. Scope the fix to the six store disclosures: explicit “접기” / “펼치기” action text, preserving native keyboard operation, existing default-open state and mobile resize state.
- Rename the label to “5개 품목별 매출 비중”. Each disclosure states “2026년 9월 · 이 매장 전체 매출=100%”. The section explains that the same store/month is the denominator and that percentage-point differences do not establish revenue growth.

## Source evidence

- KTO: https://knto.or.kr/pressRelease/549938 , published 2025-12-16. Jan–Sep 2025 versus Jan–Sep 2024 foreign-credit-card transaction-count growth, not revenue. Read the original again; unchanged series is recorded in `data/shopping-card-year-coverage-2026.json`.
- Panpan: https://www.data.go.kr/data/15084726/fileData.do . Official title/description says category sales share. Official September PNG was downloaded again and visually inspected: “카테고리별 매출비중 차트(2026년 9월)”, axis “매출비중(%)”, six gate-specific stores and five categories. SHA256 `cee1a639173df31f40d0aa4ac8cc0916d12d01e0a3db41e9f8ea4def2b0138c5` matches the prior audited original in `SHOPPING_REFINEMENTS_2026-11-01.md`.
- Interpretation: numerator is category sales in a store/month; denominator is total sales in that same store/month. All 54 store/month rows in the existing JSON sum to 100.0%. Original source does not disclose absolute sales or a separate gross/net accounting definition; neither is invented. It is not an airport-wide or foreign-customer-only statistic.

## Scope and verification

No source values, collectors, API requests, D1 writes, schedules, dependencies, runtime/deployment settings, airport layout or exchange-rate data change. Static HTML/CSS only, plus regression tests and this record. Applicable zero-cost audit: no new serving/data workload, no new source activation, truth boundaries and source precision preserved.

Tests enforce chronological legend and all six industry rows, original source values, September store/month denominator, explicit disclosure action, all thirty sales-share values, widths 320/390/600/820/821/1440, collapse/reopen and resize keyboard behavior. Exact executed checks, commit, CI, merge and production status are recorded in the PR; local checks alone are not deployment proof.
