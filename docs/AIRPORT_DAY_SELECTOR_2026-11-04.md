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
- Local Chromium could not start because this execution environment denies its socket creation. Browser verification instead ran in GitHub Actions.
- CI run [41770933182](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41770933182) passed at `9573cc88`: all 2,315 Chromium tests across four mandatory shards, core verification, and 494 bounded route/search checks.
- Reviewed the actual twelve day-rail screenshots (four languages at 320/390/1280px) and three Korean full-view screenshots from `browser-verification-shard-1`. Equal slot widths, text legibility, selected indicator and mobile/desktop bounds matched the intended design.
- Read-only source review found no state/ARIA blocker. Prior visual assertions were updated only for the requested day rail.
- Five exact ARIA/hook edits are reversed by the existing protected-file test. Original canonical hashes and all calculation/schedule guards remain intact.

## Browser coverage added

Korean, English, Chinese and Japanese at 320/390/1280px: equal-width slots, no text overflow, accessible date descriptions, 56px touch areas, touch/Enter/Space, repeated current-day click, URL/back/forward, terminal preservation, arbitrary stored-date selection, forced colors and reduced motion. Existing date/navigation and mobile-reading regressions remain in the full CI matrix.

Integrated checkpoint recovery main `339591b099d35a33c08ed701700f584aaf831f0c` while retaining both exact protected-test exception blocks. Full integrated CI is required before merge. Release this UI only after the checkpoint recovery deployment and production visual verification complete.
