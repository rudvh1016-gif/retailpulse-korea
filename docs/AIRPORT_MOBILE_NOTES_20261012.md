# Mobile airport context text

The owner explicitly requested a substantial mobile size reduction for exactly two lines: the flight-record source/collection timestamp and the selected-day/time-window/scheduled-time basis. Only those two elements receive a max-width:600px rule in app/airport-reading.css. Text and data are untouched. No global typography token, heading, metric or desktop style changes.

Actual Chrome measurements at 360px and 390px, using the same public API snapshot from 2026-10-12T03:16:51.927Z:

| Element | Before | After |
|---|---|---|
| Source/last-change note | 14px, line-height22.4px | 11px, line-height14.85px |
| Selected date/window note | 13px, line-height20.8px | 11px, line-height14.85px |
| Main total | 17px, weight600 | unchanged |

Both notes use weight400 and #333 for readable contrast. Pretty wrapping avoids an isolated final word where supported. At 360px the source note uses two lines; at 390px it fits one. The window note fits one line at both sizes. All original text is byte-equal before/after. There is no horizontal overflow or pageerror; reduced motion is enabled. At 1280px the notes retain 14px/13px and the primary total retains 17px.

- [360px source](screenshots/airport-mobile-notes-20261012/after-source-360.png) / [window](screenshots/airport-mobile-notes-20261012/after-window-360.png)
- [390px source](screenshots/airport-mobile-notes-20261012/after-source-390.png) / [window](screenshots/airport-mobile-notes-20261012/after-window-390.png)
- [Before measurements](screenshots/airport-mobile-notes-20261012/before.json) / [after measurements](screenshots/airport-mobile-notes-20261012/after.json)

TypeScript, unchanged UI-lock, diff whitespace check and native vinext build passed. This is a CSS-only product change, so no implementation-mirroring unit test was added. Focused browser verification uses the original DOM, exact content and existing selectors. No speed-score improvement is claimed. CI and the exact commit are recorded in the draft PR. Existing green PR344/345 are not modified or delayed by this independent follow-up.
