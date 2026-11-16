# Holiday card baseline correction — 2026-11-16

Owner scope: correct only the country holiday card header/date spacing and carry the fix through the normal verified release path. Baseline fetched from origin/main: `be4baec33010f656c5e1e51345aa005899308717`. Login, calendar data/calculations, delay alerts, scheduling and deployment guards are outside this patch.

## Observed cause

The supplied 1524×126 crop shows JP Labour Thanksgiving Day / 11/23 and VN Culture Day / 11/24. The live `/ko` page reproduced both cards. At browser viewport1180×757, DPR1, visualViewport scale1, both headers were at y244.75 with height24; both date rows at y272.75 with height21. There was no unequal column offset to correct.

Within each header, `.focus-event-country` was inline-flex/vertical-align:middle with a 24px flag, while the following title was ordinary inline text. The country text range started at y248.25; the holiday-title text at y247.46875: 0.78125px drift on the same nominal line. Both used KORETAIL Sans Variable, 14px/700, line-height21px. The number and weekday already shared a baseline: numeric range y274.75+16px and weekday y277.75+13px. The 14px number and intended11px weekday touched horizontally with zero gap. The screenshot's zoom cannot be inferred from its crop; no claim of a browser zoom fault.

## Small correction

Only append three selectors inside the existing next-week preparation card scope:
- Return the country label to ordinary inline baseline alignment.
- Keep the 24×24 flag as inline-block, vertically centred, with the existing5px separation expressed as an inline-end margin.
- Add0.2em between date and weekday and inherit the date line-height. Keep weekday11px, font family, weights, colours, card dimensions and title/date margins unchanged.

No JSX, source dates, weekday calculations, shared CountryFlag component, calendar or other card selectors change. Long titles remain normal wrapping content; no clamp, fixed title height, positional nudge or forced equal-height blank area is introduced. Each date follows its own full title with the existing4px margin, including when only one title wraps.

## Verification and release boundary

New `e2e/holiday-card-baseline.spec.ts`:16 combinations (ko/en/zh/ja ×360/390/430/1280), each with actual titles, first title long, second title long and CSS zoom1.25. Uses actual app/PreparationEvent and locally intercepted API fixtures. Checks country/title baseline, title/date gap, number/weekday spacing and baseline, unchanged flag/weekday sizes, overflow and equal date y for equal-line desktop cards. Saves normal-state screenshots and geometry. CSS zoom is a layout stress case, not a claim of native browser zoom coverage.

The local Chromium runner was attempted once and failed before any test body: `process_singleton_posix.cc socket() Operation not permitted`, then ptrace denial. It was not retried or worked around. The live initial measurement used the independently available supported cloud browser. Local browser cases remain pending the existing GitHub CI browser shards.

Local lint:0 errors,25 existing warnings. Typecheck passed. Existing airport-brief-presentation tests:8/8. Secret scan passed. Initial reuse of unrelated installed dependencies selected RSC19.2.8; the unchanged security gate correctly stopped the build. The isolated checkout then used `npm ci --ignore-scripts` with the unchanged main lockfile, installing19.2.9. Full build/unit/render and dependency audit results are recorded in the PR as they finish.

No UI hash, test expectation, security threshold, CI workflow or deploy guard was loosened. Publish a review branch/PR; merge only after the exact revision passes required CI, then wait for normal main CI/deployment and verify live `/api/build` plus the card DOM. Until that last check succeeds, this is not a completed production release.

Clean-install local validation completed: standard `npm test` passed the unchanged security-gated build,2876 unit tests and54 rendered-HTML tests. Typecheck and new-spec ESLint passed. Dependency audit:14 moderate,0 high,0 critical. No browser success is inferred from these results.
