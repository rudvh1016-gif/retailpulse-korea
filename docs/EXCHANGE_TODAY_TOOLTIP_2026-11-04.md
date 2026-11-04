# Today-only exchange panel and chart readout

Base: `aad60dc` (latest `origin/main` fetched on 2026-11-04).

## Requested presentation

- Show today's verified rate only in the expanded summary. Remove yesterday and tomorrow summary rows.
- Improve date-hover exchange chart UI/UX.
- Remove the coverage/source disclosure below the chart and its grey explanatory paragraph. Preserve the period/coverage caption and existing official Shilla link / online-shop reference above the rate.

## Implementation

Today's summary uses the existing `dutyFreeDatedPresentation(...).find(item => item.current)` contract. No prior-day value is relabeled. At KST midnight an old value disappears; explicitly dated evidence becomes visible only on its matching day. API errors and missing evidence remain distinct. Current-day last-good cache behavior remains intact.

The chart now responds to ordinary mouse hover, touch tap/drag and the existing keyboard controls. A compact date/KST + precise KRW/USD readout uses a dedicated top reading lane, horizontally clamped within the plot. A subtle guide and active date identify the selected observation. Escape, blur and pointer cancellation clear the selection; hover leaves dismiss unless keyboard/click focus is retained. Tooltip content does not intercept pointer input. Forced-color styling is supported, without decorative animation.

No collectors, provider calls, schema, storage, currency calculations, precision, chart values, seven-day windows or runtime dependencies change. Architecture/cost audit gates are unchanged and not claimed to be revalidated by this UI task.

## Verification

- Full unit suite: 2,813 passed.
- Focused rendering/contracts: 25 passed, including missing/current/previous/future and midnight cases.
- Typecheck: passed.
- Production build and rendered HTML tests: passed (53/53).
- Secret scan: passed.
- Browser inventory: 2,320 tests, complete without duplicates.
- Health harness: executed with `node --import tsx scripts/health.ts`; no production credentials, so operational UNKNOWN/P1 items remain unverified.
- Lint: passed with existing warnings, no errors.
- Browser tests updated for today-only behavior, hover edges, missing dates, repeated dismissal, touch and keyboard across four languages. Local execution is blocked before any page test by Chromium's Unix socket permission (`process_singleton_posix.cc: socket() Operation not permitted`), including an approved escalation attempt. Browser checks and screenshots must be established by CI; test fixtures are not production-rate evidence.
- Owner approved publication, CI, merge and deployment on 2026-11-04. Open as draft first; merge/deploy only after required verification succeeds, coordinated with the airport-card release.
