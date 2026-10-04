# Airport passenger/calendar integration review

## Preserved source revisions

| Independent review | Source head |
| --- | --- |
| PR254 reading/date segments, base | `7a54d3664db85ba54c9e31c412a53081128a8fce` |
| PR255 passenger/refund guide | `7d7bb8227917e6aeb538f74f13f674524870b23f` |
| PR256 zone percentages/ranges | `57c0de15d6b6c10d43f83d3637d3c30c70f4cfa0` |
| PR257 airport calendar | `a8ea0a940e0cdd37a39e84ad40aa60cd331ee61c` |
| PR258 mobile navigation, independently based on main | `accc12f35ddaa365d7f475df568552fa47070f32` |

Original calendar WIP `8f9d0ae86c38c06a050e80734d716a23e26a54e8` remains in its independent branch. This separate worktree cherry-picks the source changes; it does not replace any source branch or merge a public PR. Main remains `75d8121e975f92d9ab8f06b02e5459f6ae8ace90` at the latest checked fetch.

Only the active UI-lock record conflicted during integration. Existing owner records and all font/source contracts were preserved, and actual merged hashes were recorded only for explicitly authorized app integration files. Every unrelated protected hash must match; the resolving script throws otherwise. The normal owner-lock test still runs in the 1,130-unit suite.

## Combined behavior

The airport-first flow retains the existing data and source/time/truth labels. A closed passenger preparation guide provides route, checked bag, refund and duty-free pickup choices. The supplied Blender calendar icon opens the accessible calendar. Date changes preserve passenger choices, update URL/real data scope and retain the full selected-zone denominator, including unknown gates. The T2 source conflict remains individually attributed rather than being silently unified into an unofficial map coordinate.

The navigation viewport correction is preserved as a separate small source commit. Combined tests repeatedly open/close the calendar, focus its month control, resize the screen and focus/search the flight board. Normal scroll/height checks and a separate API-contract emulation run alongside existing airport and main-screen locks. Real iOS software-keyboard/address-bar behavior is still unverified; no real WebKit run is claimed. Details are in MOBILE_BOTTOM_NAV_2026-10-04.md.

No new engine, runtime model, API, paid service, sign-in, persistent passenger input, collector or forecast implementation. The v6c visual model remains explicitly preview-only; final screenshots use the existing production v5 assets with labels/numbers derived from captured public API data. They are local review screenshots, not evidence of a public release.

## Validation evidence

Local lint/typecheck/build passed, with two expected no-img-element warnings for the tiny responsive calendar icon and pre-rendered refund imagery. Unit tests: 1,130 passed; rendered HTML: 42 passed. Health configuration harness passed; live database/provider/source census remains UNKNOWN. Before the final mobile integration, 48 combined calendar/passenger/guide tests passed. The final complete browser and secret-scan counts are recorded in the PR against its exact head when complete.

The original same-condition reading benchmark at 390×844, Chromium CPU 4x, reduced motion and the same captured 577-row response had five alternating warm runs: current main median 88ms, reading refinement median 32ms. The latter included 145ms/301ms outliers during other CPU work, so this is a local expansion benchmark, not production LCP/PSI. Initial rendered flight rows fell from 147 to 0 while closed, with 22 hourly groups and four rows on the first opened group; one flight API read in both. No new production-wide speed claim is made for this integration.

## Release boundary

All work ends at reviewable draft PRs and exact-head checks. PR254/252/253 merge rejection is respected; no further merge attempt, alternative deployment or permission bypass was used. A separately authorized public release and post-release real-device/production checks remain outstanding. Blog and artifact organization are intentionally deferred until implementation/review is complete.

## Final stop-point evidence

Parent requested the turn to stop without expanding scope. Final full local browser run: **592 executed, 580 passed, 12 failed**. All 12 are the new repeated modal-close regression at `e2e/airport-integrated-preparation.spec.ts:19`, mobile 360/390/430px across ko/en/zh/ja. After selecting a date, reopening the calendar, focusing the month input and pressing Escape, the calendar trigger disappears because the browser navigates away. Trace shows the URL walking from the selected-date URL to the prior airport URL and then `about:blank`. The history/cancel interaction is not yet fixed or fully diagnosed. Existing 580 tests were not disabled or weakened. This combined draft is **blocked**, not ready for merge or release.

Final local checks: 1,130 unit + 42 rendered HTML, build/lint/typecheck and working-tree/reachable-history secret scan passed. Two known image warnings remain. No additional public operation was attempted. Standalone calendar PR257 exact a8ea0a9 CI passed 1,124/42/513; passenger PR255 exact 7d7bb82 CI passed 1,127/42/529; zone PR256 exact 57c0de1 CI passed 1,127/42/514. Mobile PR258 exact accc12f passed local 1,119/42/55; its final remote state is read separately.

Eight latest integrated screenshots were directly inspected and saved to Library. They use captured public 2026-10-04 data: 577 flight records, selected T2 denominator 272, measured navigation bottom gap 0px, no page/console errors during capture. Source/runtime corresponds to integration 358dbe8; the subsequent stop-point commit changes tests/documentation only. Windows xattr persistence is unsupported; successful Library IDs/versions and local paths are retained in `outputs/integrated-library-catalog.json`.

| Screenshot | Library ID |
| --- | --- |
| 01-calendar-and-passenger-entry-mobile.png | `libfile_abe0b5db6cec8191ae679985a214507d` |
| 02-calendar-open-mobile.png | `libfile_4ecadb4e58f0819194bbc17a484ed7a7` |
| 03-passenger-choices-mobile.png | `libfile_448feb253b1c8191b8fc6c2348948c78` |
| 04-refund-procedure-mobile.png | `libfile_e934829e108c81918bface0be37cddf0` |
| 05-t2-attributed-locations-mobile.png | `libfile_14ec4a7714bc819183562bd4f99822c6` |
| 06-zone-percentages-mobile.png | `libfile_461e05f792588191aa406b34046d71a7` |
| 07-calendar-open-desktop.png | `libfile_f58d11d5a3dc8191bfdb44641c8664e9` |
| 08-flight-scroll-navigation-mobile.png | `libfile_8fd4ea344c988191a368c1a4753d83f3` |

Resume at the repeated calendar-close bug. Keep the standalone source branches, active UI-lock checks and original fonts unchanged. Do not infer an iOS PASS from Chromium/API-contract checks. Public merge/deployment remains blocked and was never retried.
