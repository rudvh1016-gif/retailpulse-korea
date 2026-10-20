# Same-basis passenger and holiday comparisons — 2026-10-20

## Scope

- Replace the hardcoded prior-month passenger-sum comparison with a bounded read of the existing official departure forecast and arrival-based transfer-security forecast tables.
- Keep the display an arithmetic reference sum, not a deduplicated official departure passenger total.
- Compare the selected day with the previous full calendar month's daily mean only when every day has the same complete components. Missing days are not zero and no actual-passenger statistic replaces a forecast.
- Feed recent holiday comparisons from existing completed daily flight profiles instead of an empty array. The interface explicitly names sampled/eligible days, period, flights (not passengers), and partial coverage.
- Calendar context reads the runtime calendar provider when available and reviewed static events only as the fallback.

## Runtime and cost

`/api/live/passenger-reference?month=YYYY-MM` performs two indexed, bounded reads on a cache miss: at most 1,600 departure forecast rows and 62 transfer rows. It rejects truncation and failed reads. No writes, provider requests, collector or scheduler are added. Cloudflare Cache API and an isolate cache retain the compact derived reply for 30 minutes, and concurrent identical requests share one read. The browser retains only matching selected-month results.

`/api/live/airport-days` reuses its existing maximum 63 daily composition records. Additional country-day projections require completed collection evidence and valid classified destinations/buildings. Unknown or corrupt profiles are excluded instead of treated as zero. Known absent countries on a complete classified day are real zero observations.

## Validation

- New unit tests exercise complete/partial months, absent or duplicated transfer components, zero, leap years, failed/truncated source contracts and indexed query plans against the real migration schema.
- Existing reference-sum and holiday-comparison regression tests remain applicable.
- Local validation: 25 unit/regression/query-plan tests passed; scoped ESLint and TypeScript passed. Browser run was blocked before assertions by Vite/workerd `Network connection lost` during server readiness; CI must run the added three browser tests.
- Browser tests use explicitly artificial arithmetic boundary fixtures. They are not production data and are not evidence that production history is complete.
- Production availability of September transfer forecasts and the October country-day series must still be verified after a permitted runtime read. Implementation completion does not establish source completeness or particular percentages.
