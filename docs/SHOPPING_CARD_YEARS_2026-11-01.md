# Card-comparison source and year boundaries

Owner now requests 2024–2026 together, centered on 2025 versus 2026, with unacquired years/categories explicitly unavailable. Keep this separate from PR #554 so its font/desktop release is not delayed.

## Verified sources

1. https://knto.or.kr/pressRelease/549938 — published 2025-12-16, KOGL Type 1. Its comparable shopping-category series is foreign credit-card **transaction counts**, Jan–Sep 2025 versus Jan–Sep 2024. Existing six growth rates and seven subcategory growth rates are retained. 2024=100 indices are calculated as `100 + published percentage growth`; these are neither absolute counts nor revenue. The source page explicitly names the periods and count metric.
2. https://knto.or.kr/pressRelease/550575 — published 2026-06-17, KOGL Type 1. This is May 2026 versus May 2025 **spending amounts**, not the same count series or nine-month period. Do not insert its figures into the existing graph. It can support a separate dated amount analysis after appropriate version checks, not a substitute for this requested matching series.
3. https://datalab.visitkorea.or.kr/site/portal/ex/bbs/View.do?bcIdx=311089&cbIdx=1135&pageIndex=1 — official 2026-08-11 notice; original PNG downloaded from its visible attachment and inspected. May 26 changes include UnionPay population estimation, merchant administrative codes/amounts and industry definitions; August 11 adds casino retrospective data. The notice applies spending-amount changes to the full 2018–present history and instructs using latest data. It does not establish revisions to transaction counts. Any new amount series must acquire 2024/2025/2026 from the same current version.

## Acquisition result

On 2026-11-01, official public press-release and Data Lab searches did not yield the matching current 2026 six-category transaction-count series. The public regional-tourism screen displayed amount charts through September 2026; its official industry download (`checkDn(3004)`) redirected the existing session to a login form. No authenticated session was available. No new login, personal information, consent form, API call or alternate collection path was used. A current official download supplied by an already-authorized logged-in user is needed to validate replacement values/classification/version. Do not infer that no 2026 data exists anywhere.

## Product handling

Show 2025 first and 2026 second, with 2024 as a reference. Retain the existing published 2024/2025 indices and their exact dates; 2026 is `null` in the provenance JSON and shows `미확보` without a zero-length bar, fake value or calculated 2025→2026 growth. The seven detailed growth bars are explicitly labeled 2025 Jan–Sep versus the same 2024 period. Unavailable wording is allowed only in this newly requested year-comparison area. Font, desktop expansions, store comparisons and other home work remain preserved.

The remaining data-acquisition blocker is the official login-gated download and matching count/category documentation, not a license claim or proof that 2026 data is unpublished. `data/shopping-card-year-coverage-2026.json` records known values, nulls, source/version boundaries and the excluded amount alternative.

Read-only connected-browser inventory also found no existing authenticated Data Lab tab. Any later file must include its applicable reuse terms; official download availability alone does not establish commercial redistribution permission. This branch adds no new 2026 numeric claims. Local build, TypeScript, lint, six font/data unit cases and eight Chromium cases passed, including all six industries showing null/missing 2026 without a fabricated bar.

## Public nationwide amount comparison acquired without login

MCST https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pMenuCD=0302000000&pSeq=22790 (2026-10-22), displayed KOGL Type 0. Official PDF pages 1 and 3 visually checked. Jan-Sep 2025 spending 107,940 versus 2026 159,416 KRW 100 million, +47.7%; online included. Both years are taken from this same release; the nine 2026 monthly values sum exactly to its total. No 2024 amount, monthly 2025 or matching industry breakdown was supplied. Historical releases are not spliced into this amount series. Amount is a separate nationwide tourism metric, not the historical category count indices or airport/store sales. No API, login or consent submission. The public report replaces login as the acquisition route for this aggregate comparison. It does not solve the detailed six-category 2026 count gap.

Latest main a3df2730 mobile store expansions and monthly relocation were retained. Static content only: no collectors, APIs, database, schedules or runtime cost changes.
