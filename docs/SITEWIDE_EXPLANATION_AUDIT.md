# Concise explanation audit — 2026-10-21

Source-level route inventory, not a browser/production certification. All four locale routes share these components. This deliberately small patch preserves original explanatory text and existing headings, values, source links and states. No collectors, forecasts, FX data, fonts or backgrounds change.

## Checklist

| Route / secondary view | Finding and disposition |
|---|---|
| `/[locale]`, `/airport-glance` | Production glance composition. TOP3 methodology and daily average owned by parallel daily-average patch; keep reference dates and missing states visible. |
| `/airport` | Country-passenger paragraph in legacy/shared monthly table is the exact owner quote: replace first reading with **인천공항 전체 · 노선 국가별 월 출발 여객**. Entire original four-language paragraph, including selected-terminal caveat, stays in closed details. Source link and actual month remain outside. |
| `/airport-countries` | Trend source and monthly table folding owned by country-chart worker; independent chart axes, actual collection time and nationality boundary checked there. No competing edit here. |
| `/airport-prepare` | Departure scope, preparation limits and checked dates are operational constraints, not optional methodology; retained. Bank-holiday scope owned by daily-average worker. |
| `/myeongdong`, `/hongdae`, `/seongsu`, `/itaewon` | Live-area views: loading/stale/last-confirmed state and official forecast horizon must remain visible. No blanket fold. |
| `/where-to` | Long comparison-basis paragraph already inside closed `comparison-details`; unchanged. |
| `/consumption` | Matching/duplicate/missing/zero-baseline methodology already inside closed details; collection clock and observed means remain visible. Unchanged. |
| `/business` — official history tab | Exposed four-row `MetricExplainer` condensed to a localized summary: monthly short-stay foreign presence, hourly average, not visits/sales. All four original rows retained in closed details. Period controls and actual dates unchanged. |
| `/forecast` — records/reference | Monthly record method and prediction history already folded. Two MetricExplainer instances already inside closed `records-reference`: deliberately keep their existing layout rather than nesting disclosures. Missing comparisons and coverage remain. |
| `/more` | Collection-status reasons and scheduling caveats already closed; error count stays visible. Usage guide already folds optional examples, not truth boundaries. No changes here. FX research/disclaimer work is separately owned. |
| `/about`, `/about` legacy entry | Product purpose and official/reference distinction are introduction, not technical boilerplate; retained. |
| `/tourism-desk`, `/tourism-desk/[area]` | Full event descriptions already use details. Registration/source/availability constraints retained. |
| `/travel-records` | Device-only storage, backup and deletion information affect user actions; retained. |
| `/airport-news` | News/source context is the page's content, not redundant methodology; retained. |
| `/airport-focus-preview`, `/airport-glance-preview` | Shared production/preview components receive upstream changes; no duplicate patch. |
| `/`, `/predictions` aliases; not-found | Redirect/fallback routes, no independent long technical paragraphs to fold. |

## Verification

- `node --import tsx --test tests/concise-explainer.test.ts tests/site-usage-disclosure.test.ts`: 11 passed.
- Focused ESLint: zero errors; two existing `next/no-img-element` warnings in the country-passenger component.
- Native `<details>` is closed by default; `<summary>` has a 44px minimum target with native keyboard behavior, no custom click/focus suppression.
- Original quoted paragraph and MetricExplainer field strings preserved byte-for-byte (baseline comparison); periods, figures, missing states and source URL unchanged.
- `git diff --check` passed.
- Browser QA not run: root reports local browser execution denied; no retry/bypass. Full typecheck/build/aggregate tests not run here; integrator owns aggregate validation.
- Local fetch returned stale mirror `origin/main=6fd5e2e`; do not treat it as production/current main. Patch based on isolated snapshot `2143a30` of integrator's staged heading worktree, not a main update.

## Handoff boundary

Root review required. No commit publication, merge or deployment performed. This is source-audited route coverage, not a claim that every screen was visually inspected or that every paragraph should be hidden.
