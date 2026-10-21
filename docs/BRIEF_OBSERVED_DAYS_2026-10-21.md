# Prior-month collected forecast days: bounded comparison

Base: verified GitHub main `10a5f9bcb1dc6e30dbf94317245d77fe0036b0f4`.
Includes the exact #420 localization head
`e78c68e8c7a1f1f220263045081ca6a8aa726987` (tree
`b7b441e8ffc5aa9e556c338c82face5f31ac965e`). The separate draft depends on
#420 and must not be merged independently before #420. Existing #420 is unchanged.

## Metric and evidence

The owner's screenshot shows T2 selected-day expected departures 43,319 plus
expected transfers 9,600 = arithmetic sum 52,919 on 2026-10-21. These are
**forecasts**, not measured departure actuals or flight counts. The sum remains
explicitly non-deduplicated arithmetic; a transfer-security forecast must not be
silently treated as a distinct departing person.

The screenshot reports 22 complete days out of September's 30, but does not
provide the 22-day numerator or missing dates. No production numerator is claimed
here. Synthetic test totals are not production values. Runtime validation after
an authorized deployment remains required.

For the same terminal scope, the existing two bounded, indexed reads supply daily
departure forecast intervals and official transfer forecasts. A service date is
included only when full-day departure coverage and exactly one valid transfer
component per required terminal are complete. Partial intervals, duplicates,
missing/null/invalid components and unsafe counts exclude the whole date.

The API now retains those complete dated component pairs (at most 31 per scope).
The brief verifies the exact previous-month date partition, derives its numerator
from those pairs, then divides by their dynamic count. It shows the sample's
N/D coverage, numerator/divisor, missing-day count and exact missing dates in the
basis disclosure, explicitly saying it is **not a full-month average**. No
statistical representativeness is asserted. Missing dates are not zeros. A real
zero mean permits a count difference, never a percentage.

The month-wide `mean` stays null unless the entire calendar month is complete.
Other comparison policies, collector activation, providers, quotas, SQL limits,
cache TTL, scheduling and writes are unchanged. Old cached partial responses
without the new dated proof remain withheld until naturally refreshed.

## Localization and validation

Optional `lang` signatures, the shared increase-blue/decrease-red sign contract,
country/date/source associations and #420 EN/ZH copy are preserved. Only the
authorized collected-days basis paragraph changes in the Korean static fixture.
New sample-path tests check KO/EN/ZH totals, signs, dates and no Hangul in EN/ZH.
CI browser fixtures use explicitly synthetic forecast pairs at 390/1440 pixels.

Local focused unit/static-render suite: 39 passed. Scoped ESLint: zero errors,
one pre-existing internal-navigation warning in `airport-focus-production.tsx`.
Full TypeScript checking, changed-file checks and exact remote CI are reported in
the draft PR. Local browser execution was not attempted; browser/build validation
uses normal CI. No merge or deployment is performed by this change's author.
