# Selected departure summary removal — 2026-11-02

The owner selected the Korean departure-view block containing the terminal monthly heading, comparison month, standalone period and total departures comparison. The zone comparison table immediately below, including its own comparison-period caption, was outside the selection and must remain.

`AirportMonthlyFlights` now has an optional `showSummary` presentation flag, defaulting to true. Both loaded and loading/failure portal paths in `AirportDepartureMap` disable that summary for Korean departures. T1 and T2 use the same behavior. Other languages and the separate country/zone routes retain their current presentation.

The shared comparison-month control moves **inside the retained zone table block**, below its title. It still uses the existing month state and request; changing a month updates all retained tables. The control also remains available when no current month is loaded. The zone title, four rows, caption/period, methodology, source disclosures, percentages, missing/error/retry state and calculations remain intact. No new read, polling, dependency or collector.

Local evidence: 33 Chromium checks passed: eight T1/T2 × 390/1440px × map available/unavailable selection-removal cases plus all 25 existing monthly-flight cases. Checks cover exact removed nodes, retained caption/row values, working month selection, races, retry/last-good behavior, one-read portal transitions, date resets, four-language country views and keyboard disclosures. TypeScript and relevant unit tests passed; changed-component lint has zero errors (one existing image warning). Exact commit/CI/release evidence is recorded in the PR body.

Earlier priority Panpan work is isolated in PR #562; gauge work is in PR #561. These commits touch distinct feature files and must be preserved. No production completion claim until the resulting main CI, Cloudflare deployment and live page checks succeed.
