# Airport brief hierarchy and minute marker

Baseline: `7eba5c3c772f1ab3e72c6926cbe9a1b0b5c35101` (PR #145).

Owner's 21:03 KST phone screenshot showed the current-time badge but no
vertical dashed rule. The rule existed in source; prior checks asserted its
selector/border and the badge, not its painted height. A read-only Chrome
Production measurement still returned 130 px, so the exact iOS rendering
failure is not independently reproduced here. Do not claim a confirmed Safari
engine defect or that every browser was tested.

The empty, absolutely positioned grid pseudo-element now has explicit
`height: calc(100% - 28px)`, zero width and start alignment. It no longer
depends on automatic top/bottom stretching. Its height is independent of the
passenger bar; its x coordinate and badge retain the exact minute fraction.

The briefing leads with the selected terminal's full-day official expected
departures in bold, then current-hour expected departures. The other context
stays muted below; the daily figure is not repeated there. A non-today date
says selected day, not today. Missing comparisons remain explicitly missing.
T1/T2/all scopes and official-forecast-versus-observation boundaries remain.

Regression coverage: actual DOM at 11:57, 21:03 and 23:59, mobile 390 px and
desktop 1440 px; all/T2/T1/all switching; daily-first ordering and selected
totals; full-height dashed rule, visible color, minute/badge alignment and
horizontal viewport position. Existing past/future-day tests remain.
Production Visual Check now measures and logs the real rule height and
attaches chart screenshots. No API, collector, database, dependency or
scheduler changes.

Local validation: typecheck, lint, build, 35 focused UI truth checks and 39
render checks passed. Required CI and Production checks are recorded in the
pull request after execution; they are not assumed passed by this document.
