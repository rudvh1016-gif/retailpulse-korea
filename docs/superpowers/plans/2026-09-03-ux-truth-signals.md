# Current Signal Truth Hotfix Implementation Plan

**Goal:** Make commercial timing, events, and signal time horizons unambiguous while preserving the existing official data and zero-cost runtime architecture.

**Architecture:** Add pure presentation helpers for event validation/de-duplication/ranking and structured commercial copy, let the existing cached summary return its bounded de-duplicated event set, and replace the flat numbered list with four semantic groups plus dedicated commercial and event blocks.

**Execution rule:** strict red-green-refactor. Each behavior below must fail for the intended missing behavior before production code changes.

## Task 1: Pin commercial truth

1. Change the commercial unit tests to require separate status, amount, optional count, reference-window, retrieval, attribution, privacy, and stale-age fields in all four locales.
2. Assert that the safe wording is `reference time + recent 10 minutes`, and that no calculated start/end interval appears.
3. Run the focused test and observe the expected failure against the combined current row.
4. Implement the smallest structured builder and card markup that passes.

## Task 2: Pin event selection and URL safety

1. Add pure behavior tests with running, upcoming, duplicate-content, duplicate-fingerprint, distance, title, valid-link, and unsafe-link fixtures.
2. Run them and observe failure because the helper does not exist.
3. Implement deterministic de-duplication, ranking, status, first-sentence preview, and HTTP(S)-only homepage validation.
4. Use the helper in the summary route; retain the bounded existing D1 read and expose all selected events so the client can expand without another provider request.

## Task 3: Pin accessible event disclosure

1. Replace the old clamp-oriented browser test with behavior assertions for three representative cards, exact total, all-events toggle, full stored overview in a details control, and conditional official links.
2. Add KO/EN/ZH/JA assertions for event status, details, all-events, and official-page copy.
3. Observe the browser test fail against the single clamped row.
4. Implement a dedicated event panel and cards, then remove the route excerpt and CSS clamp.

## Task 4: Pin semantic groups and responsive geometry

1. Add browser assertions for the exact group order and per-row time-state labels.
2. At 390px assert no page overflow, full-width event cards, 44px controls, and source text below values.
3. At 1280/1440/1920px assert value/source blocks stay together and their readable width does not stretch to the far edge.
4. Observe failures, then implement the four group containers and focused responsive CSS using the existing tokens and locale fonts.

## Task 5: Verify and release Phase A

1. Run focused unit, rendered-source, and Playwright tests; then lint, typecheck, the complete unit suite, build, secret scan, and full browser suite.
2. Capture screenshots at 390, 1280, 1440, and 1920 and inspect all four locales, keyboard disclosure, long prose, link safety, fonts, and overflow.
3. Inspect the full diff for provider/scheduler/Demand Index changes and unrelated files.
4. Fetch `origin/main`, confirm conflict state without rebasing or rewriting, commit, normal-push, open a focused PR, and merge only after all CI is green.
5. Explicitly deploy the merge SHA to Production, verify smoke, source health, actual commercial and event values, all four locales, cache MISS→HIT, uncached `/api/live/summary` rows read, and exactly five Cron expressions.
6. Do not start Phase B until every Phase A Production gate is recorded.
