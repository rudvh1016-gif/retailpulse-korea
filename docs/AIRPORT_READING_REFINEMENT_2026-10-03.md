# Airport reading refinement — 2026-10-03

Review-only branch based on origin/main `75d8121e975f92d9ab8f06b02e5459f6ae8ace90`. PR #252 (model work) and #253 (internal hall repair) are independent; their changes are not included. No merge, deployment, production flag or hall publication policy was changed.

## Result

- Yesterday/today/tomorrow use one connected control with actual dates, existing typography and keyboard selection. The future date picker and terminal/date data contracts remain intact.
- Flight lists start collapsed with complete counts. Opening shows hours and counts, then 20 rows per opened hour, with search, row details, show-more and focus-safe collapse. This reduces the simultaneously mounted list without truncating the underlying data.
- All WEST/CENTER/EAST regional leaders and every tie remain visible. Overall leaders are highlighted, unverified locations are separate, and complete gate lists retain search, zone filters and staged access. Missing retrieval is distinguished from confirmed zero.
- The daily primary airport number uses the owner's approved compact 36–40px bold exception; normal body typography remains unchanged. Insets and current/peak label spacing are tightened.
- Monthly comparison uses the selected horizontal capsule draft A: a common zero baseline, dynamic shared scale and direct exact values. Daily values are short rounded pastel bars with subtle depth; missing dates and cumulative calculations remain unchanged. The rejected point/stem trial and alternate draft B remain in prior history/artifacts. No previous-month daily series was invented.
- Seoul observations retain solid black exact bounds and official forecasts use a separate pastel ribbon with both supplied bounds. No observed-to-forecast bridge or midpoint is fabricated. Source, issue time, KST, slider keyboard/touch controls and gaps remain intact.
- Arrivals and departures share the white/black/pastel chart treatment.

## Data boundaries

The existing flight-proportion passenger reference estimate is preserved from main. Its equal-passengers-per-flight assumption, caveats and existing calculations are unchanged; it is not an official east/west passenger count. The verified east/west denominator remains separate from the whole-flight denominator. Registered country does not become passenger nationality; flight counts do not become people or waiting time. Public official-hall disclosure remains off/withheld.

A captured public API response supplied 577 flight rows, including 147 concourse flights, 156 ranked gates overall and 79 T2 gates. These values were used for local verification only and are not hardcoded in product code. All rows remain reachable.

## Owner follow-ups on 2026-10-04

- Gate search blank-list regression: the staged first 20 rows had inherited `content-visibility:auto` paint deferral inside the scrolling list. Their content now paints immediately with `content-visibility:visible`; staging and show-more remain intact. Three equal-height regional cards show one broad proportional bar per occupied zone and all tied gate chips, rather than one decorative prism per tie.
- T2 gate 291: restore exactly the reviewed `c7f3eaf` coordinate-based EAST record at the owner's explicit request. Retained official-map POI 61286 is x=745/y=1043, read 2026-09-29. The earlier #249 exclusion was based on the published 208–290 range; this repair is one evidenced exception and does not expand arbitrary ranges. The classification is KORETAIL-computed `OFFICIAL_MAP_MIDPOINT`, not official east/west text. No fresh coordinate verification is claimed. The captured current 577-row response changes T2 EAST119/WEST131/CENTER21/UNVERIFIED1 to EAST120/WEST131/CENTER21/UNVERIFIED0, total272 unchanged.
- Remove the decorative departure model above the passenger chart. The existing single zone-labelled model/counts and destination countries are rendered into a slot immediately below that chart, using the same map state and flight data. Original lower placement has no duplicate model. Business brief maps retain their original context. Physical building and time filters update the moved model and countries without another data request; the concourse keeps its unsupported passenger forecast notice.
- Exact registered gate groups are generated from the union of retained official coordinate keys and the active per-gate classification records. Only consecutive numbers are compressed; gaps and singletons remain visible. All mode separates T1/T2/Concourse, includes CENTER, and displays unverified registered positions separately. Expanded evidence distinguishes official airport text from KORETAIL calculation on official map coordinates. This register is expressly separate from active-gate flight rankings.
- v6c is locally integrated with actual rendered WebP assets and matching cropped projection anchors. `VITE_AIRPORT_MODEL_PREVIEW_ROOT` selects those assets only in Vite DEV; production and unset development configuration retain existing v5. No engine/dependency or permanent asset replacement is introduced. Original artwork and `.blend` files are preserved. Local preview assets total approximately 296KiB across eight images. Approved source bundle: `libfile_b396e20abd8c8191b60f5f9f0a3da6f4`; anchors: `libfile_7c1c913f3484819194164dca8fa59962`. Set the preview variable to the local directory containing `T1_day.webp`/`T1_night.webp`, T2, CONCOURSE and OVERVIEW pairs.
- Arrivals use the actual 18px page inset without a second inner gutter. Monthly capsule A remains a review draft; the user approved v6c for local integration only. Public merging/deployment remains pending.

Latest Library previews: T2 moved model/registered numbers `libfile_19b961be64088191ad7eec2201a5e74b`; T1 `libfile_b31e5f2322388191b770f74766046c00`; all `libfile_86fdb5b47f008191a69b3a898108d84d`; concourse `libfile_647b2a1ff40081918a6cd376cff057b6`. Gate list paint `libfile_5a951e4e25fc8191ad076733f01cc831`; repaired291 `libfile_8d954e02e21c8191a7d4321ad203fef1`; capsule A `libfile_8b57d6042a4c81919b6eae6b4d496e4d`.

## Earlier committed verification and evidence (2679262; before the follow-ups)

- Lint, typecheck and verified production build passed.
- Unit suite: 1,119 passed; the final protected-file/operational lock check additionally passed 44 tests. UILock enforcement stays enabled with explicit owner-authorized hash transitions.
- Rendered HTML: 42 passed. The two new primary number roles have narrowly scoped 700 weight exceptions; the existing body weight guard remains active.
- Entire working tree and reachable Git history secret scan passed.
- Initial full browser pass: 458 passed / 38 failed. Failures included old exterior expectations, a shared Vite dependency cache conflict and one timeout. Exterior tests were updated only for the explicitly requested connected controls, regional leader layout and exact two forecast bounds. Local caches are now isolated under ignored node_modules paths, outside production code. No test is skipped, no timeout raised and no lock disabled.
- Final full browser rerun passed all 496 tests in 8.3 minutes. A subsequent decorative search-icon addition is covered by the final focused rerun and current-SHA remote CI.
- Live-response matrix: Korean/English/Chinese/Japanese at 360/390/430/1280px, airport departures/arrivals and all four Seoul districts; no overflow or page errors. Final screenshot values remain data-derived.

Library previews (390px):
- Airport header/dates: `libfile_348e02b988c8819185e5071895b2f58a`
- T2 regional gate leaders: `libfile_885eae6c4194819188028e133868d449`
- Monthly and daily points: `libfile_56537b4474708191a451b0436aed62f1`
- Seoul observations/forecast: `libfile_e3951dde1f5481918e39291506a206a8`

Baseline screenshots on exact main: monthly `libfile_4b9aaaa78af48191bcf2a1b8b6b51a05`, gates `libfile_9a6e5d998cd08191a53127f5c12f20ba`, Seoul `libfile_b05633567e608191aae3b0e33fea6bb2`.

## Same-condition local comparison

Exact main versus the refined branch was compared after implementation, alternating five measured repetitions following a warm-up, using local Chromium at 390×844, reduced motion, CDP 4× CPU throttling and the identical captured 577-row response. Native performance time was kept real; date time alone was fixed. Hydration and fonts were ready before measuring click-to-two-animation-frames. This retrospective exact-main benchmark complements the baseline screenshots captured earlier; it is not a deployed before/after PSI test.

| Metric | Exact main | Refined |
| --- | ---: | ---: |
| Outer-list expansion median | 153ms | 41ms |
| Mounted flight rows on outer open | 147 | 0 |
| Hour summaries on outer open | 0 | 22 |
| First opened hour rows | n/a | 4 |
| Flight API reads | 1 | 1 |

The refined outer open initially shows hour summaries; users then open the desired hour. Every row remains available. The measured tasks therefore describe initial list expansion, not rendering all rows simultaneously or deployed page load. Raw five-pair samples are in `AIRPORT_READING_PERFORMANCE_2026-10-03.json`.

## Performance limits

No dependency, 3D engine, provider fetch or data-read path was added. Existing request-sharing/read-budget browser tests remain enabled. Hour grouping and staged rows reduce flight DOM expansion; this is a rendering change, not a claim of production LCP improvement. Historical PSI 57/LCP 4.4s/CLS .353 is not presented as a current baseline. Public mobile performance needs the separate approved release and a same-condition deployed measurement before any production speed claim.

## Stop point

Keep this PR draft for visual review and current-SHA CI. v6c has local design approval; the capsule comparison is a local review draft. Merge/public deployment require the parent's pending explicit user approval and have not been executed.
