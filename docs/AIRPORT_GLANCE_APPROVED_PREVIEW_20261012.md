# Airport glance — approved artwork connected, publication still pending

The requested Library image `libfile_59815a4d20bc8191abc8b10d52ef2e49`, version1, was obtained through the user's existing Whale browser and the ordinary Library download route. The Windows transfer helper was not modified. The downloaded file is `exec-04566c4c-705b-4074-b17a-02d7175ae3a5.png`, 3,030,243 bytes, 1448x1086. Its SHA256 is `1c47eb2bb573444475ce911a606d353a9b7e7a7985f1be421a356558659a2b51`. Actual pixels were inspected before integration; the whole original composition is retained without cropping or regeneration.

The isolated, noindex preview route now displays responsive WebP derivatives at 480/960/1448px. Original aspect ratio and image dimensions reserve space. The image has high fetch priority; below-image data continues to use the existing API/hooks. No 3D engine, new dependency, collector or storage write was added.

## Current candidate: decision summary (supersedes earlier long layouts)

The latest owner feedback asks for a 15-second decision summary, preserving the approved image and existing detailed page. The top three links now show (1) the longest fresh comparable departure-hall wait with hall/terminal/time and ties, (2) the upcoming scheduled departure slot with the most flights, excluding elapsed departures even inside the current partial hour, and (3) the largest positive previous-month daily-mean destination change. Missing/zero-baseline comparisons do not produce invented summaries. Shared queue selection retains freshness, duplicate-conflict and closed-reading rules; a zero reading is not recommended as quiet. A 60+ reading retains its plus sign.

T1/concourse/T2 counts and west/centre/east shares remain HTML inside the image on desktop and mobile. Only T1/T2 receive actual hall observations; no concourse waiting time is created. Image width is capped at800px on desktop without cropping. The concise country shares and daily-mean change Top5 sit directly below it. They are separate measures: selected-day destination flight share versus monthly daily-mean percentage change. Unknown destinations retain the selected-day denominator. Top country ties remain included; the complete list is a link to existing detail, not a duplicated list. The long hourly chart and time controls have been removed from this preview only. Date and terminal controls remain.

## Current actual screens
- [PC1440](screenshots/airport-glance-overlay-20261012/glance-overlay-1440.png)
- [Mobile360](screenshots/airport-glance-overlay-20261012/glance-overlay-360.png)
- [Mobile390](screenshots/airport-glance-overlay-20261012/glance-overlay-390.png)
- [Mobile430](screenshots/airport-glance-overlay-20261012/glance-overlay-430.png)
- [Evidence](screenshots/airport-glance-overlay-20261012/capture-evidence.json)

These captures reuse the stored public API response and source clock 2026-10-12T06:43:09.299Z (15:43 KST), DPR1, reduced motion. Actual values: T2 hall1A24min at15:41 (tied); upcoming18:00–19:00 has36 scheduled flights; MP daily mean+50.0%, September30 versus October11 included days. Country shares show Japan165/563=29.3% and China133/563=23.6%. No screenshot numbers are hardcoded in production. Four captures have no horizontal overflow or page errors; pixels were inspected on PC/mobile.

The same source image remains 3,030,243bytes; responsive derivatives480/960/1448 remain57,294/199,386/364,242bytes. The current desktop selects960, mobile480 at DPR1. No new API, image generation, 3D engine or dependency. No whole-site PSI/LCP claim.

Targeted validation: typecheck PASS; scoped ESLint0 errors/one existing static-img advisory; glance decision/country5 + font2 PASS; unchanged UI-lock PASS; native build PASS; new decision-summary browser9 + missing-clock failure1 PASS (360/390/430/1440 overlay bounds/nonoverlap, terminal/date switching, no stale current waits on past dates, loading failure, four languages, keyboard details and destination links). The former long-layout tests were replaced to reflect the explicitly superseding design; UI-lock tests and approval hashes were not modified. Earlier full feature checks were not repeated.

Draft only: this is a revised candidate, not final approval. Existing detail is not shortened, and no merge/deployment was run. Library delivery is handled by the parent; no duplicate upload attempted. Earlier capture folders are retained as historical evidence, superseded by the links above.

Final review also verifies that a failed summary clock cannot label available flight records as “no upcoming departures”; that case is unavailable. Type/lint, the single added failure-path browser test and build passed after the guard. Normal-data captures above are unchanged.


## 2026-10-12 follow-up: mobile spacing, shared flags, date fixture

- Mobile <=700px: terminal overlays use 220px width with three equal direction/value columns and small vertical offsets. Font sizes are unchanged. Desktop keeps the existing 225px flex overlay layout and image dimensions.
- Summary, country shares, and change Top 5 reuse the existing country flag assets on both desktop and mobile. Unknown/other and the domestic-destination category do not receive invented flags. No new data or detailed-page changes.
- CI 38220071045 failed because the test summary fixture always returned October 11, including October 9/10 requests. `useLiveSummary` correctly rejects a response whose serviceDateKst does not match the selection. The fixture now responds with the requested date and PAST relation. Production guards were not relaxed.
- A controlled pending-summary test verifies unavailable while flight data has already arrived, then no-upcoming only after the matching past-day summary arrives. Missing-summary clock protection remains tested.
- Targeted verification: mobile 360 / desktop 1440 layout + rapid date changes + missing clock + deferred summary: 5 passed. Prior 7 viewport/localization checks passed. Native production build completed. Screenshots refreshed at 360/390/430/1440 with decoded flags, no overflow, and no page errors; see capture-evidence.json.
- This remains an unpublished preview. No merge or deployment was performed.


## 2026-10-12 worker-focused follow-up: smaller mobile plates and two future summaries

User feedback: large white plates obscured the airport. Mobile containers are now transparent, shadow-free, 176px wide (was 220px), with zero outer padding; only individual text rows have an 88%-opacity narrow backplate. Fonts and three-column west/center/east alignment remain unchanged. At the same saved source time, combined overlay bounding area fell about 25%; T1/T2 height 71.27→67.27px, concourse 57.77→52.77px. Desktop retains 225px overlays with the same 93.5/78.5/93.5px heights, position, image size and background. Approved image assets remain unchanged.

Removed only the glance-page departure-preparation link. The detailed airport guide remains intact; the customs/news link remains.

Immediately above destination shares: whole selected-day departures versus the preceding month's included-day departure mean, in the same ALL/T1/T2 scope. Reuses monthlyMetric and published monthly totals, with T1 including concourse. Shows delta flights and percent, month and included-day count. Missing/current null, wrong previous month, no included days or zero prior mean yields comparison unavailable. Actual zero selected-day count with a positive verified baseline remains a valid decrease. Raw unrounded values drive the calculation; only display is rounded. Other selected dates are labelled selected-day, never today.

Approved future summaries share one 1/3/6-hour selector. Initial state is explicitly 1 hour; the existing date/whole-day view is unchanged. Both cards filter the same deduplicated, non-cancelled departure records from verified current time (inclusive) to end time (exclusive). They show KST start/end, scope and selected-window count. Non-today dates, missing summary clock or missing/truncated flights are unavailable. Windows stop at midnight with an explicit next-day-coverage note; no next-day data is invented.

- Zone card: all tied highest known building/side counts; west/center/east counts and shares separately for T1 main, concourse, T2. Each building denominator includes its unknown-side records; unknown buildings are separate. No passenger/retail-crowding inference.
- Destination card: same window denominator, existing country flags, top five plus all cutoff ties; remaining destinations can be expanded. Unknown destination stays in denominator and receives no invented flag. Country is destination, not passenger nationality.

Saved real response at 2026-10-12 15:43:09 KST renders 563 whole-day departures versus September included-day mean 552.9: +10.1 flights (+1.8%), 30 included prior dates. The independent 15:43–16:43 window has 27 departures; known leading zone T2 west 9; Japan 13/27 (48.1%). These are screenshot evidence, not production constants.

Validation: 7 scoped unit tests pass (scope/dedupe, missing/zero baseline, future boundaries, ties, unknowns, midnight). 8 scoped browser cases pass (360/390/430/1440, English/Chinese/Japanese, shared 1/3/6 selection, terminal and past-date transition). Typecheck and native build pass; scoped lint has zero errors and two static-image advisories. Actual-source screenshots at all four widths: no overflow/page errors, decoded flags. Full screens plus focused airport/future-section captures and capture-evidence.json are in docs/screenshots/airport-glance-overlay-20261012. No full manual suite or prior-CI rerun added.

### Deferred navigation requirement — do not implement before final glance approval

User explicitly asked to remember only: after airport glance is finalized, replace only the mobile store navigation button with airport glance. Preserve the PC store button. Requested primary sequence: Airport glance → Airport → Seoul glance → Seoul → Consumption flow → More; the PC store placement between Consumption flow and More is a parent proposal, not a finalized instruction. This is a later completion checklist item. No global navigation, store page or store feature was changed in this follow-up. Merge and deployment still require separate approval.

### Data limits for subsequent candidate research

Available here: selected-day scheduled departures, terminal/building/gate/side mapping, mapped destination countries, verified current queue observations, and monthly included-day flight aggregates. They support aircraft distribution/comparisons; they do not establish passenger nationality, actual visitors, staffing demand, store sales, or shop congestion. Future summaries currently consume only the selected day's verified flight response.


## 2026-10-12 compact-label revision after 88598c7e

The owner explicitly superseded the previous keep-font-size constraint: both mobile text and white area were still too large. Mobile overlays now use 140px width and one short inline direction/ratio row. Heading 12→10px, count 11→9px, direction 11→8px, ratio 12→9px, queue 10→8px. Only narrow text backplates remain (78% opacity); no large plate or shadow. Desktop image/overlay geometry and typography are unchanged.

Same actual response, time, DPR1 and 390×844 viewport, before 88598c7e → after:
- T1/T2: 176×67.27 → 140×34.39px (about 59.3% smaller bounding area).
- Concourse: 176×52.77 → 140×24.80px (about 62.6% smaller area).
- Combined bounding area: about 60.3% less. Image remains x12/y414.81, 366×274.5px.
- PC remains 225px wide, 93.5/78.5/93.5px high with identical positions/font sizes; image 800×600px at the same position.

The two Korean headings now exactly match the promise: 앞으로 가장 몰릴 구역 / 곧 몰리는 목적지. Representative known zones (all count ties) and leading destinations (all maximum ties) appear first, then flights/percentage, then a short time/basis line. Zone percentage remains the named building denominator; destination percentage remains the shared selected-window total. Detailed zone table, remaining destinations and longer counting caveats remain accessible in disclosures. No calculations, missing-data guards, future selector, or whole-day comparisons were changed.

Evidence is under docs/screenshots/airport-glance-compact-20261012: before-88598c7e-390-viewport.png and after-390-viewport.png are both exactly 390×844, without magnifying the airport. Matching -full.png files show the entire page at the same width, including the two summaries. JSON files record measured geometry/font sizes. 1440px evidence verifies the unchanged PC airport. Existing overlay captures were also refreshed. Hidden country flags now intentionally lazy-load when their destination disclosure is opened.

Scoped verification: 3 language cases and the synchronized future-window/detail disclosure case passed; the four viewport cases initially found an ambiguous keyboard test selector after adding the counting-basis disclosure. The selector now explicitly targets the existing airport concept disclosure, preserving the keyboard assertion, and those four viewport cases were rerun. No full manual suite, data changes or deployment.

Final result: all 8 scoped browser cases pass (4 viewport cases after selector correction, 3 languages and future-window case). Typecheck/native build pass; scoped lint zero errors, two existing static-image advisories.


## 2026-10-12 black overlay text and full PC/mobile completion captures

User requested black text for every label inside the airport image, especially wait readings and observation time, on PC and mobile. Scoped CSS now sets airport-overlay text to #000. Inactive-terminal overlay opacity is also kept at 1 so text does not fade back to gray when selecting T1/T2. No size, font, position, airport asset, outside decoration/chart state color, calculation or global navigation change.

Verification: 4 affected Playwright cases passed: 360/390/1440 layout and every overlay text node's computed black color, terminal-switch opacity/color, keyboard disclosure, plus synchronized future hours/terminal/past-date behavior. The initial attempt had connection-refused errors because the local dev server had ended; after starting it, all four passed. Scoped ESLint and diff checks passed. Existing calculation suites were not rerun; automatic mandatory CI remains intact.

An additional actual-response browser capture verified all three widths, exact two Korean headings, visible decoded flags, day/previous-month comparison, matching start/end in both future cards at 1/3/6 hours, no horizontal overflow and no page errors. At 390 and 1440, each overlay's measured position/width/height/font sizes equals the prior ed4a8728 measurements. Both complete page images were visually reviewed.

Deliverables (entire page, not a cropped section):
- docs/screenshots/airport-glance-black-text-20261012/airport-glance-pc-1440.png
- docs/screenshots/airport-glance-black-text-20261012/airport-glance-mobile-390.png
- docs/screenshots/airport-glance-black-text-20261012/airport-glance-mobile-360.png
- verification.json in that folder records source time, geometry, colors, periods, flags and errors.

Limits: these are local Chrome responsive viewport checks using the saved actual response at 2026-10-12 15:43:09 KST, not a fresh live-data capture or physical-device Safari test. No new performance-score claim or full-suite manual rerun. No merge/deployment; conditional navigation checklist remains deferred, with PC store navigation preserved.


## 2026-10-12 remove glance-only customs-news entry

Latest explicit instruction supersedes earlier keep-news notes: removed the customs-news navigation block from Airport Glance on both PC and mobile. The departure-preparation entry remains absent. No news route/function, detailed airport page, global navigation, other layout/font/color, or destination calculation changed.

User questioned the usefulness of Japan repeatedly being the largest destination. Proposed alternative: destinations increasing in the next equal-length window, ranked by change in flight count between current/next windows. This is a proposal awaiting approval and is NOT implemented; the existing destination window/count/share logic remains intact.

Minimum verification: PC1440/mobile390 browser cases both pass, including absence of news and preparation links. Actual-response full-page capture checks also passed at 1440/390/360, with unchanged overlay geometry/fonts/black text, matching 1/3/6-hour card periods, visible flags, no overflow or page errors. Scoped lint zero errors/two existing static-image advisories; diff check passed. No calculation-suite rerun.

Latest complete pages: docs/screenshots/airport-glance-no-news-20261012/airport-glance-pc-1440.png and airport-glance-mobile-390.png; 360px full page and verification.json are in the same folder. These supersede earlier captures containing the news link. Source remains the saved real response at 2026-10-12 15:43 KST. Public merge/deployment and conditional global menu changes remain unapproved/not performed.


## Approved completion: adjacent destination increases and consistent compact UI

Latest owner approval supersedes the previous proposal-only note. The destination card is now **다음 시간대에 늘어나는 목적지**. With selected N=1/3/6 hours, it compares [current time, current time+N) against [current time+N, current time+2N), with equal duration and adjacent boundaries. Known countries rank by positive absolute change in departure count, not total volume or percentage. Every maximum-delta tie is shown; the rest remain in an expandable change list. 0→positive is a finite +flight count, with no growth percentage. No known increase displays no-increase; if unknown destinations could prevent that conclusion, it explicitly withholds a definite no-increase claim. Unknown counts are shown separately and excluded from country ranking.

The zone card still describes the FIRST N-hour interval. It now says 앞 alongside its period. The destination card explicitly shows 앞 and 뒤 periods, so the two meanings are not represented as identical. Whole selected-day departures and monthly comparisons remain separate.

Readiness: matching selected service date, today's verified summary/clock, non-truncated flight response explicitly marked truncated=false and a valid retrieval timestamp are required. Pending/failed/truncated/undated responses are unavailable. If both full intervals cannot fit within the available same-day response, comparison is held rather than clipping two unequal intervals. Exact end at midnight is allowed; a millisecond beyond it is held. No next-day request or external collection was added. These are available scheduled records, not guaranteed actual operations, passenger nationality, customer counts or shop congestion.

UI polish uses the existing font family and ink/silver palette. Below the unchanged airport image, section/representative titles share 13px, body/control text 12px, notes 10px; consistent 24px column gaps and control padding preserve compactness. No enlarged white plates or fonts. The small mobile black image labels and PC image geometry remain identical. News/preparation entries remain absent; global navigation remains deferred.

Actual saved-source evidence (2026-10-12 15:43:09 KST):
- N=1: 15:43–16:43 versus 16:43–17:43, Thailand 0→4, +4 departures.
- N=3: 15:43–18:43 versus 18:43–21:43, Vietnam 7→20, +13 departures.
- N=6: first interval 15:43–21:43 remains visible for zones; the second interval crosses midnight, so destination comparison is held.
These are derived screenshot evidence, never hardcoded application values.

Verification: 4 new focused unit cases pass (dominant-country versus absolute increase, ties/zero baseline, 1/3/6 boundaries, midnight/readiness, unknown-only/no increase). 6 affected browser cases pass (three languages; first-versus-next periods, terminal/date changes; truncated and midnight withholding). The midnight fixture initially set browser time to 10:15 before returning a 23:00 response; it was corrected to a consistent pre-navigation 23:00 clock and that single case passed on rerun. No production clock/guard was weakened. Typecheck/native build pass; scoped lint zero errors/two existing img advisories; diff check passed. Previously successful calculation suites were not manually repeated.

Full-page PC1440/mobile390/360 captures: docs/screenshots/airport-glance-increase-20261012/airport-glance-pc-1440.png, airport-glance-mobile-390.png, airport-glance-mobile-360.png. verification.json records actual-source rows for N=1/3/6, unchanged airport geometry/fonts, black labels, visible decoded flags and no overflow/page errors. Images were visually reviewed. Limits remain local Chrome/saved real-response verification, not physical-device Safari or live passenger measurement. Fresh CI and final visual approval remain before public merge/deployment.


## Latest zone explanation: why this area matters

The first card is now **앞으로 출발편이 가장 많은 구역**. Each tied representative shows terminal/building plus side, scheduled departure count, share of ALL flights in the currently selected terminal scope/window, destinations calculated only from that exact building+side+window, and the other two sides from the SAME building. The basis line explicitly names the selected scope and its total. The expandable detailed table retains its separately labelled per-building percentages; the representative headline no longer silently uses the building denominator when ALL is selected.

Leader-specific destinations are aggregated from the already deduplicated/cancellation-filtered selected-window flights. Show the top two destination counts plus all cutoff ties, preserving unknown labels without invented flags. All maximum zone-count ties remain separate representatives. No reuse of whole-airport country composition and no cross-terminal peer comparisons.

Saved-source verification at 15:43–16:43 KST: T2 west has 9 of the selected ALL 27 departures, 33.3%; its own leading destinations are Japan 4 and United States 2. The same T2 has east 6 and center 2. Source-zone-audit.json records the nine original mapped flights/gates/destinations, independently filtered from the detailed departure map. Under T2 selection the denominator correctly becomes T2's window total instead.

The extra context uses existing 13/12/10px type and compact rows, with no enlarged font, white plate or airport-image change. Current/next-window destination comparison remains unchanged. News/preparation entries and global-menu edits remain absent/deferred.

Validation: one new focused unit test covers exact zone/window destination isolation, elapsed rows, unknown destinations/buildings, all-scope versus T2 denominators, same-building peers and tied leaders. Two new browser cases (390/1440) pass for ties, flag/counts, selected-denominator switching and overflow. Actual-source full-page captures/checks at 1440/390/360 pass, including the independently audited 9/27 and Japan4/US2 details, black overlay text, unchanged airport geometry/fonts, period behavior and no page errors. Typecheck/native build/diff pass; scoped lint zero errors/two existing static-img advisories. Previously passed test suites were not manually repeated.

Newest complete images: docs/screenshots/airport-glance-zone-context-20261012/airport-glance-pc-1440.png, airport-glance-mobile-390.png and airport-glance-mobile-360.png. verification.json and source-zone-audit.json accompany them. Saved real-response/local Chrome limits still apply. Public merge/deployment remains unapproved and unperformed.


## Selected-period wording and requested T1/T2 current-implementation previews

The zone denominator now explicitly says, for example, **전체 · 선택 시간대 총 27편 중 9편**, next to the dynamic first-window start/end. This is the selected future interval, not the daily total. T2 selection correctly shows 17 window flights / 9 west flights (52.9%).

Current-implementation terminal screenshots were captured without generating/replacing/cropping the approved airport asset or inventing a new map design. For each T1/T2 selection: PC1440×1000 and mobile390×844 viewport screenshots, plus corresponding complete-page screenshots. Files are in docs/screenshots/airport-glance-terminal-selections-20261012 with names airport-glance-{T1,T2}-{pc-1440,mobile-390}-{viewport,full}.png. verification.json records selected states, actual labels, daily/period totals and no page errors/overflow.

Verified behavior and limitation:
- The same complete airport picture stays visible for either selection. T1 main 158, concourse 142, T2 263 and their individual building percentages remain separate in-image labels; no label merges T1 main with concourse.
- Existing T1 terminal-filter policy includes both its main building and concourse for the outside selected-scope total: 300/day, 10 in the first future window. The representative is concourse west 4/10 (40%), China 4. This pre-existing terminal aggregation policy was not changed by a screenshot request.
- T2 selected total is 263/day, 17 in the window; T2 west 9/17 (52.9%), Japan4/US2. The ALL selection remains 9/27 (33.3%).
- The selected tab is underlined/bold. Image labels retain correct data-selected attributes (T1+concourse for T1, T2 for T2), but their text/background currently have no visible selected-building distinction because all labels remain black and fully opaque. Thus in-image selection emphasis is weak; this is explicitly reported rather than claimed fixed. No new highlight/outline or terminal-specific image was introduced without a design decision.

The actual-source capture validation checks the new denominator text at 1440/390/360 and each of four terminal views, with separate building counts and matching filter states. Typecheck/scoped lint/diff pass (two existing img advisories). No additional broad test suite rerun. These terminal captures supplement the latest ALL full-page captures in airport-glance-zone-context-20261012. No merge/deployment.


## Current correction: physical building scopes (supersedes previous T1-inclusive previews)

The owner's latest instruction overrides the previous terminal-selection section: T1 now means **T1 main only**, with CONCOURSE as its own tab. The old terminal-selections captures showing T1=300/day and 10/window are historical, not the approved current scope. ALL / T1 main / CONCOURSE / T2 now consistently select daily totals, destination shares, hourly summaries, future zones/destination increases and monthly comparisons. Image labels explicitly name T1 main.

Reuse, not a second implementation: `lib/airport-monthly-building.ts` is copied byte-for-byte from PR347 head `8f501c02bf473de66b968332addd646e0acf5e1c`; both blobs are `aad51252d98598bc3e61eba0aeacbe75832b6e05`. Its existing `mainBuildingMonth` projects stored T1-inclusive monthly aggregates to main-only on the same included dates, rejects absent/inconsistent splits and leaves source data unchanged. Daily flights use the existing departureMap physical-building filter. PR347 should land before public integration (or be coordinated in the same approved integration) so detailed monthly views and this preview share the correction. No full cherry-pick or protected-file changes were made.

Official processing remains terminal-scoped: CONCOURSE uses the observed T1 queue, explicitly labelled T1. The visible note says “탑승동도 T1에서 출국수속 · 대기는 T1 공통 관측”. No concourse queue or passenger forecast split is invented; raw data and official forecast code are unchanged.

Saved real-response evidence at 2026-10-12 15:43:09 KST:
- Daily ALL563 = T1 main158 + CONCOURSE142 + T2 263.
- First future window ALL27 = T1 main3 + CONCOURSE7 + T2 17.
- T1 main east2/3 (66.7%); ALL T2 west9/27 (33.3%); T2 west9/17 (52.9%).
- Previous-month means independently checked against source aggregates and their included-day denominator; T1 main155.3/day, with no concourse double-counting.
These are capture evidence, not hardcoded application numbers.

Validation for this correction only: four focused unit cases PASS; three new browser cases PASS (360/390/1440), checking each building's daily/country/month/window scope and shared T1 queue. Typecheck and native build PASS; scoped ESLint zero errors/two existing static-img advisories; diff check PASS. No broad suite rerun, raw collection, merge, deployment or CI bypass.

Current screenshots: `docs/screenshots/airport-glance-building-scopes-20261012/airport-glance-{ALL,T1,CONCOURSE,T2}-{pc-1440,mobile-390}-{viewport,full}.png`, plus ALL mobile360 viewport/full. `verification.json` records nine capture states with no page errors/overflow, consistent counts, black labels and decoded image. PC concourse and mobile T1 full-page images visually reviewed. All 18 captures supersede prior terminal-scope images. Local Chrome/saved responses are not live-browser performance measurements or physical-device Safari verification.

Selection remains clear in the tab but weak inside the full airport image: data-selected now identifies only the selected physical building, while approved black/opaque labels remain visually alike. No unapproved image highlight was added. Public integration and deployment remain pending separate approval.
