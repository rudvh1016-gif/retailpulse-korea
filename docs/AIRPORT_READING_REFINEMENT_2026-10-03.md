# Airport reading refinement — 2026-10-03

Review-only branch based on origin/main `75d8121e975f92d9ab8f06b02e5459f6ae8ace90`. PR #252 (model work) and #253 (internal hall repair) are independent; their changes are not included. No merge, deployment, production flag or hall publication policy was changed.

## Result

- Yesterday/today/tomorrow use one connected control with actual dates, existing typography and keyboard selection. The future date picker and terminal/date data contracts remain intact.
- Flight lists start collapsed with complete counts. Opening shows hours and counts, then 20 rows per opened hour, with search, row details, show-more and focus-safe collapse. This reduces the simultaneously mounted list without truncating the underlying data.
- All WEST/CENTER/EAST regional leaders and every tie remain visible. Overall leaders are highlighted, unverified locations are separate, and complete gate lists retain search, zone filters and staged access. Missing retrieval is distinguished from confirmed zero.
- The daily primary airport number uses the owner's approved compact 36–40px bold exception; normal body typography remains unchanged. Insets and current/peak label spacing are tightened.
- Monthly comparison uses equal-sized points on a common zero-based dynamic axis with direct values. Daily values are equally spaced thin stems and round points; missing dates and cumulative calculations remain unchanged. No previous-month daily series was invented.
- Seoul observations retain solid black exact bounds and official forecasts use a separate pastel ribbon with both supplied bounds. No observed-to-forecast bridge or midpoint is fabricated. Source, issue time, KST, slider keyboard/touch controls and gaps remain intact.
- Arrivals and departures share the white/black/pastel chart treatment.

## Data boundaries

The existing flight-proportion passenger reference estimate is preserved from main. Its equal-passengers-per-flight assumption, caveats and existing calculations are unchanged; it is not an official east/west passenger count. The verified east/west denominator remains separate from the whole-flight denominator. Registered country does not become passenger nationality; flight counts do not become people or waiting time. Public official-hall disclosure remains off/withheld.

A captured public API response supplied 577 flight rows, including 147 concourse flights, 156 ranked gates overall and 79 T2 gates. These values were used for local verification only and are not hardcoded in product code. All rows remained reachable. Approved v6/v6b replacement artwork is awaiting parent review; this PR does not replace model assets or use the faint pearl raster mockup.

## Verification and evidence

- Lint, typecheck and verified production build passed.
- Unit suite: 1,119 passed; the final protected-file/operational lock check additionally passed 44 tests. UILock enforcement stays enabled with explicit owner-authorized hash transitions.
- Rendered HTML: 42 passed. The two new primary number roles have narrowly scoped 700 weight exceptions; the existing body weight guard remains active.
- Entire working tree and reachable Git history secret scan passed.
- Initial full browser pass: 458 passed / 38 failed. Failures included old exterior expectations, a shared Vite dependency cache conflict and one timeout. Exterior tests were updated only for the explicitly requested connected controls, regional leader layout and exact two forecast bounds. Local caches are now isolated under ignored node_modules paths, outside production code. No test is skipped, no timeout raised and no lock disabled.
- Final 496-test browser rerun: in progress at draft creation; the PR body/checks will state its final result.
- Live-response matrix: Korean/English/Chinese/Japanese at 360/390/430/1280px, airport departures/arrivals and all four Seoul districts; no overflow or page errors. Final screenshot values remain data-derived.

Library previews (390px):
- Airport header/dates: `libfile_348e02b988c8819185e5071895b2f58a`
- T2 regional gate leaders: `libfile_885eae6c4194819188028e133868d449`
- Monthly and daily points: `libfile_56537b4474708191a451b0436aed62f1`
- Seoul observations/forecast: `libfile_e3951dde1f5481918e39291506a206a8`

Baseline screenshots on exact main: monthly `libfile_4b9aaaa78af48191bcf2a1b8b6b51a05`, gates `libfile_9a6e5d998cd08191a53127f5c12f20ba`, Seoul `libfile_b05633567e608191aae3b0e33fea6bb2`.

## Performance limits

No dependency, 3D engine, provider fetch or data-read path was added. Existing request-sharing/read-budget browser tests remain enabled. Hour grouping and staged rows reduce flight DOM expansion; this is a rendering change, not a claim of production LCP improvement. Historical PSI 57/LCP 4.4s/CLS .353 is not presented as a current baseline. Public mobile performance needs the separate approved release and a same-condition deployed measurement before any production speed claim.

## Stop point

Keep this PR draft for visual review and current-SHA CI. New artwork needs separate approval. Merge/public deployment require the parent's pending explicit user approval and have not been executed.
