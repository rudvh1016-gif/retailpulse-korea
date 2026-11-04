# Airport day selector refinement — 2026-11-04

## Request and scope

The owner requested a more refined yesterday/today/tomorrow UI on the airport status page. The supplied mobile reference showed three unevenly spaced blue rectangles occupying only part of the page width.

The airport-only presentation now uses three equal-width text choices on a white surface, quieter secondary dates, and a short two-pixel selected-day indicator. The mobile rail fills its container; desktop is capped at 420px. Every choice is at least 56px tall and can grow with enlarged text. No new fonts, assets, dependencies, animations, providers, requests, collection schedules, D1 writes, calculations, passenger values, or exchange-rate changes.

The existing server/KST day anchoring, date handlers, URL/history behavior and stored-date disclosure remain unchanged. Date button labels now reference their visible date via unique accessible descriptions. Other screens retain their existing visual date controls.

## Verification

- Baseline: main `39fcd2b9848a573b004df1a332de6c335e31ca49`.
- Build passed.
- Lint passed with 24 existing warnings, zero errors.
- Typecheck passed.
- Unit suite: 2,786 passed.
- Rendered HTML: 53 passed, with the same site origin as the build.
- Secret scan passed.
- Browser inventory: 2,315 tests, complete and disjoint across four shards.
- Local Chromium could not start: the execution environment denies its socket creation even with elevated execution. Therefore local browser assertions and screenshots are **not verified**. The CI browser matrix must pass before merge; review the generated screenshots before publication.
- Read-only source review found no state/ARIA blocker. Prior visual assertions were updated only for the requested day rail.
- Five exact ARIA/hook edits are reversed by the existing protected-file test. Original canonical hashes and all calculation/schedule guards remain intact.

## Browser coverage added

Korean, English, Chinese and Japanese at 320/390/1280px: equal-width slots, no text overflow, accessible date descriptions, 56px touch areas, touch/Enter/Space, repeated current-day click, URL/back/forward, terminal preservation, arbitrary stored-date selection, forced colors and reduced motion. Existing date/navigation and mobile-reading regressions remain in the full CI matrix.

The collection-recovery change is being handled separately. Rebase onto its merged main while retaining both protected-test exception blocks, rerun checks, and coordinate merge order before release.
