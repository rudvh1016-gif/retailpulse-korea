# Chart A — actual implementation preview, not approved for publication

The owner selected A and requested a running SVG/CSS preview. The reference Library record resolves as `libfile_5353570c85c081919b9a21b21becaec5`, but its pixels could not be materialized in this Windows environment. This implementation follows the parent's confirmed description; exact image matching remains unverified.

- Existing hourly SVG: ink-blue elapsed bars, light-blue upcoming bars, mint current band, equal existing spacing and small rounded corners. Decorative side/cap paths are hidden. Existing values, geometry, forecast semantics, marker, keyboard and selection remain.
- Existing zone estimate bars: west blue, centre purple, east teal by semantic zone, rather than alternating row colour. Values, unavailable-data withholding and denominators remain unchanged.
- Monthly official forecast: flat ink-blue comparison and daily bars, mint selected day. Formula, periods, counts and daily selection are unchanged. Cylinder depth/highlight layers are hidden, not substituted with new data.

Screenshots below are real local Chrome captures using public API data retrieved at `2026-10-12T03:16:51.927Z` (12:16 KST), not text or values copied from the generated image. Time was fixed to that snapshot for reproducibility.

| Surface | Desktop | Mobile |
|---|---|---|
| Hourly | [1440](screenshots/airport-chart-a-20261012/chart-a-current-1440.png) | [390](screenshots/airport-chart-a-20261012/chart-a-current-390.png) |
| Monthly | [1440](screenshots/airport-chart-a-20261012/monthly-a-current-1440.png) | [390](screenshots/airport-chart-a-20261012/monthly-a-current-390.png) |
| Zone estimate | [1440](screenshots/airport-chart-a-20261012/zones-current-1440.png) | [390](screenshots/airport-chart-a-20261012/zones-current-390.png) |

The current capture has all three elapsed/current/upcoming finishes and READY zone estimates without forcing that state. Monthly keyboard selection changes October 12's 49,239 / cumulative 564,868 to October 1's 45,179 / cumulative 45,179. Both viewport widths have no horizontal overflow or page errors.

Library upload of the requested capture batch failed with the supported helper reporting that prepare_uploads was unavailable in its runtime. No IDs were produced, no alternate authentication or metadata bypass was attempted. Screenshots are retained here as draft review evidence.

Public merge/deployment requires the owner's review of these actual captures. The airport-glance artwork remains a separate blocked preview. PR343, PR344/345 and data follow-up PR347 are not part of this change.

Local verification: TypeScript and scoped ESLint passed; the existing UI-lock test passed without hash changes; 11 relevant unit tests, 46 rendered HTML tests and 21 browser tests passed. Browser coverage includes four languages, 360/390/430/1280px, current-minute marker and terminal switches, equal ties, unknown gates and genuine zero estimates. Native vinext production build passed. The existing vendored frontend-design and web-design-guidelines skills were used; no duplicate installation. No new font, image, dependency, API call, scheduler or data write is introduced. No new controlled before/after performance benchmark was run, so this PR makes no speed-score claim.

## Revised candidate after rejection of the first chart

The earlier candidate was rejected and is not approved for publication. The current hourly chart uses flat, evenly spaced columns (64% of each band), ink-blue elapsed bars, pale-blue upcoming bars and mint only on the current band. Duplicate curved areas, strokes, decorative depth faces, gradients, moving curve dots and the rectangular time pill were removed from this component. Current time and its exact value are aligned at the top; a thin solid mint stroke retains the exact minute coordinate. Peak value and keyboard/pointer readings are preserved. Tooltip heights now follow the actual column value instead of a smoothed curve. No data calculation, forecast range, terminal sum, gap or timezone changed.

- [Revised PC1440](screenshots/airport-chart-refined-20261012/chart-refined-1440.png)
- [Revised mobile390](screenshots/airport-chart-refined-20261012/chart-refined-390.png)

Same stored public response and clock as above (12:16 KST): peak5103 and current2385 passengers, T2. PC/mobile no overflow/page errors. Existing CSS initially overrode SVG fill attributes; the revision explicitly sets per-bar inline fill and the browser regression now asserts the real current mint fill. Only the expected old ink marker color and rectangular-label source assertion were updated for the requested visual change; exact-minute geometry, visible stroke, late-hour label containment and proportional values are still checked.

New targeted checks: typecheck/scoped lint PASS; flow/UX truth43 PASS; model-scope browser5 PASS; revised minute-marker browser3 PASS; native build PASS; UI-lock unchanged PASS. Monthly and zone calculations/controls were not changed again or redundantly re-tested. This is one revised candidate; no merge/deployment and no new image generation. Parent handles Library delivery.
