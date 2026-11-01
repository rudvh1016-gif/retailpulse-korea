# Shopping briefing release — 2026-11-01

Owner approved the reviewed report and production release. Entry label: `외국인은 뭘 살까?`. Korean desktop navigation places it between preparation and More; mobile places it right of the airport glance title. Other home content and five-item bottom navigation remain intact. Report CSS/JS are isolated static assets; there is no added API, collector, scheduler, D1 write, or personal-data collection.

## Source boundaries

- Korea Tourism Data Lab, 2026 Q2 preliminary inbound visitor survey: https://datalab.visitkorea.or.kr/site/portal/ex/bbs/View.do?cbIdx=1127&bcIdx=311046 . Page displays KOGL Type 1. Survey period April–June 2026, departing foreign-national visitors aged 15+, stays under 91 days. Tables 3-17/3-18 (printed pp.50/52) supply Q1/Q2 selected-category comparisons. Multiple responses; exact item denominator and item sample size were not established and are not invented. Differences are percentage points, not significance claims or sales shares. Selected categories are not each quarter's independently established top five.
- Official Q2 PDF SHA256: `1B8CE9B0291B704AB386916D8FFE236FFDF91A077DDDD1B1C587545BB7188F40`. Q1 separately published report and 2025 final report have different restrictive notices and were not repackaged.
- Korea Tourism Organization, https://knto.or.kr/pressRelease/549938 (2025-12-16), KOGL Type 1: foreign credit-card transaction-count growth, Jan–Sep 2025 versus same 2024 period. Chart uses 2024=100 indices, not absolute counts or revenue. Duty-free 6.2% growth means index 106.2. Do not imply current real-time conditions.
- Korea SMEs and Startups Agency distribution/Panpan public file https://www.data.go.kr/data/15084726/fileData.do : unrestricted reuse notice. Six gate-specific stores, five categories, Jan–Sep 2026, 270 published composition percentages retained in `data/shopping-briefing-panpan-2026.json`. January/February store order is normalized by store label. Monthly disclosed composition differences use percentage points, not revenue growth. Older differing store aggregations are not joined to this series.

Official published decimal precision is retained in this separately approved report. Survey responses, card indices, and store sales composition are distinct measures. No inferred nationality, airport-wide sales, traveler preference, or invented third-quarter/6th–10th rankings are included.

## Verification and deployment gate

Local build, TypeScript and lint passed (existing lint warnings remain). Two report/data unit tests passed. Six Chromium tests passed, including widths 320/390/820/821/1440, navigation order, unchanged bottom navigation, report entry, all six stores, monthly controls, source links and reduced motion.

Windows vinext static serving returned 404 for built assets; local browser checks used a read-only localhost harness serving exact built static assets and forwarding SSR to vinext. No production runtime workaround was added. Full local unit tests showed CRLF-sensitive existing assertions; no repository-wide line-ending changes were made. Official Linux CI must pass on the exact PR commit before merge. Production deployment and live verification remain pending until recorded in the PR.

Base: `7e928423ad52f46993e0fe19292cf3dbf73ce421`. Concurrent PR #547 edits different files; recheck latest main and CI before merging. This change does not modify deployment workflows, migrations, mobile bottom navigation, or collection policy.

First Linux CI identified three expected integration updates: Korean-only entry excluded only from shared-language attribute parity, the new approved glyph added to the bundled font (+276 bytes, original cmap retained), and exact approved navigation/header hunks reversed before protected UI hashes are checked. All other locked bytes and schedules remain protected. Seven targeted parity/font unit checks and five existing desktop navigation/browser checks passed locally. Final CI remains the release gate.
