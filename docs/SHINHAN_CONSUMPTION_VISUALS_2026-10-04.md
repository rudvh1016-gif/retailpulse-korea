# Shinhan consumption category charts — draft review

The consumption view now draws shallow SVG prisms from published payment counts or amount ranges. It retains Seoul's complete business-category list, amounts, counts, ordinal activity labels, observation/collection times, region and date selection, sources and cautions. The aggregate card puts actual amounts/counts before the activity grade; native disclosures retain the full explanation.

Base: `75d8121e975f92d9ab8f06b02e5459f6ae8ace90` (`origin/main`, verified 2026-10-04). Independent branch: `codex/shinhan-consumption-visuals-20261004`. No changes to user/Claude branches, API/calculation contracts, forecasts, fonts, dependencies, schedules or production assets. No merge/deploy is authorized or executed.

## Data and rendering contract

- Source: [Seoul OA-21285](https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do), Shinhan **domestic-consumer** activity during the stated ten-minute observation window. Payments are transactions, not people, purchased-product quantities, foreign purchases or total area sales.
- Each front-face length uses a valid published count or amount bound. Constant decorative depth does not encode data. The shared axis includes every supplied category, including initially hidden rows. Amount hatching preserves the supplied minimum–maximum range; ordinal grades never determine geometry.
- Zero draws an empty axis and explicit zero value. Missing, suppressed, invalid and incomplete intervals draw no invented complete bar. A published half-range remains readable as its known bound plus “not supplied”; a valid published upper bound still participates in the amount axis.
- The existing source-order three-row preview and accessible **all categories** disclosure remain. No fixed five-category or image-state limit. New/long/unknown category labels retain a neutral icon slot and all numeric fields.
- `app/commercial-category-icons.ts` uses exact provider category labels. The reviewed `shinhan_industry_icons_v1` assets supply 13 icons plus a new-category fallback, 14 WebP files totaling **10,408 bytes** at 64×64px. Original Blender/PNG files are preserved outside the repository. Images have explicit dimensions, lazy loading, asynchronous decoding and SVG failure fallback. SVG/HTML carries live data; illustration files never determine values. The manifest records the source contract (`libfile_4846fefab42881919ca44d328360dbdb`), ZIP (`libfile_048937762ac4819195453e3012cb0f00`) and exact hashes.
- Reviewed chart-material contract `libfile_5ced23953e6c8191bff783447f6b468f` supplies the observation blue `#93b5d1` and amount-range mint `#bad6cd`. Live SVG faces use these materials. Normalized pre-render samples contain no real data and are never stretched into numeric bars; the front geometry remains driven by API values with constant caps/depth.

## Validation

- Lint: 0 errors, 1 `no-img-element` warning for the future pre-optimized local illustration slot. Typecheck, secret scan and verified build pass; rendered HTML **42/42**.
- Full unit suite: **1124/1125 pass**, no skips. The sole remaining failure is the original Owner UI Lock guard because three authorized UI source files changed. The lock fixture and test are byte-identical to main.
- New Chromium E2E: **19/19 pass**. Korean/English/Chinese/Japanese at 360/390/430/1280px; keyboard metric/list/disclosure controls; reduced motion; full-list scale; grade independence; zeros/missing/partial ranges; unknown long category; changed area/date/data; empty results; initial HTTP failure; failed-refresh values/timestamps preserved; every approved icon, new-category fallback and failed-image recovery.
- Existing relevant browser suites: **15/15 pass** (industry guidance, Seoul summaries, readable insights, population outlook). No duplicate PR259 integration run.
- Inspected actual mobile and desktop pixels; corrected CSS specificity that initially joined the axis labels and amount/count text. Font coverage caught three new syllables; equivalent existing supported copy removed the risk of extra fallback font requests without changing font assets or fixtures.
- Local fixed-snapshot captures: no page errors or console errors. Live production and previously approved v2 district WebP hashes remain unchanged. v3 models are a **browser-only review** with all four images loaded at 1120×920, not asset integration.

## Same-condition comparison and limits

Captured public summary: `2026-10-04T06:09:31.007Z`. Core chart comparison before the later approved icon handoff uses separate own local Vite servers, Chromium, fixed source data/clock, fonts ready, reduced motion, no throttling, one discarded warm-up then three alternating fresh-page runs.

| Width | Aggregate card height before → after | Median local LCP before → after | CLS before → after | Horizontal overflow |
|---|---:|---:|---:|---:|
|390px|494.58 → 422.55px|104 → 100ms|0.25478 → 0.25478|0 → 0|
|1280px|413.09 → 360.11px|388 → 388ms|0.18865 → 0.18865|0 → 0|

The actual chart adds informative space, so the whole category/environment section becomes taller. This is a layout/readability change, **not a verified public speed gain**. Core development module requests increase 162→166; both renders request only the existing Korean primary font. The later illustration set adds at most 10,408 bytes across all 14 icons and loads visible rows lazily; it is not included in those earlier LCP figures. Resource Timing was unavailable in the warmed harness, so transferred-byte figures are not claimed. Production PSI/TBT and real iOS Safari are not measured in this task. Existing initial-page CLS remains a separate issue. No 3D runtime or new package is added.

## Review captures in Library

- Summary mobile: `libfile_2c2a09dd123881919481a2f4d0837c23`
- Amount ranges mobile: `libfile_a111b1d3b67081919d2ceb97124a4c4d`
- All categories mobile: `libfile_bd93162ad6cc8191af30ee1a6b7fd34f`
- All categories desktop: `libfile_b4a1a5fbb3e0819191a0360caeb12b5f`
- District v3 separate review: `libfile_3a2be94811c8819183b4a21156516043`

These are local component captures from a fixed actual public API snapshot. Fixed bottom navigation is hidden only during component screenshots to prevent an unrelated overlay from obscuring text. Screenshot styling never changes repository/product CSS.

## Approval blocker and stop point

Automatic approval review rejected the attempted normal UI-lock hash/approval refresh: “the user authorized the UI implementation but not this exact lock-policy change.” The rejected command never executed. **No retry or workaround occurred**; `tests/fixtures/phase2-locks.json` is unchanged, and the original test still fails visibly.

Exact end-user authorization is required before updating only the protected hashes for `app/globals.css`, `app/live-signals.tsx` and `app/operational-context.tsx` and adding the audit record in `tests/fixtures/phase2-locks.json`. Every other protected hash/assertion/schedule stays unchanged. This draft is reviewable but not ready to merge. After that approval: normal fixture refresh, the unchanged full guard/suite, exact-head CI, then separate public merge/deployment approval. No deployment authorization is implied by approving the UI-lock refresh.
