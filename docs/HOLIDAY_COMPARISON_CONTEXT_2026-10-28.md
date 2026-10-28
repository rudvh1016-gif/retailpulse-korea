# Holiday comparison context — 2026-10-28

Baseline: `7d99392ed8679943809ad278ecdd01a630cf87fa` (origin/main checked at clone and again before PR preparation).

Main advanced to `12a92a072af92c502f6fff0d7d2e11ecccb3bc89` during work (PR496). This branch was rebased onto it, preserving the new today comparison, content-addressed lazy parser, airline relocation controls and all upstream navigation changes. Generated assets were rebuilt from the combined sources.

The gray bar represents the selected reference period, not a nonholiday period. The previous UI already mentioned Mid-Autumn in a small conditional note. It did not read the shared calendar API, and the recommendation buttons and overlap note had separate fixed 2026 dates.

## Change

- The lazy comparison document reads `/api/airport/calendar`, the same reviewed/runtime projection used by the preparation calendar. No provider calls, new scheduler, database migration or writes were added.
- Recommendations come from verified national multiday events intersecting the existing destination flight archive. Only clicking a recommendation changes the selected ranges. Equal-length reference ranges retain the same weekdays; both ranges can contain holidays.
- Both periods show destination holiday/rest intervals with country, full year, source and actual review date, alongside independently collected flight days. Korean departure-origin context is labeled separately. Other destination countries are not mixed into the selected country's holidays.
- The shared API retains existing reviewed Chinese `dateKind` and `makeupWorkdays` fields. Adjusted rest intervals are not presented as statutory holidays on every date; makeup working days never count as holidays.
- A negative holiday statement requires explicit complete annual national coverage and an effective verification date. Sparse events, absent calendars, failed/stale refreshes and unpublished years remain unknown. Last verified positive events can remain visible with a failed-refresh note.
- Flight means and signed calculations are unchanged. Missing dates are excluded, never filled with zero. The warning does not infer unchanged demand, holiday causality, passenger nationality or retail sales from similar flight means.

## Existing source boundaries

`lib/holidays.ts` uses KASI `getRestDeInfo`, current and next month only. Existing code/docs record service-specific HTTP 403/AUTH failures and a 20-hour scheduled cooldown; successful cached months are preserved. This change neither repairs account authorization nor claims current KASI success. Korean reviewed annual events are already in `calendar-context.json`, separate from KASI collection health.

`official-calendar-runtime.ts` automatically refreshes only JP, US and SG using the existing scheduler and scoped replacement rules. CN and other priority-country annual arrangements are reviewed snapshots, not automatic provider renewal. The comparison now automatically follows that common projection; it does not expand official source coverage. KR 2026/2027 events remain reviewed annual facts. No future dates or continuous rest bridges are inferred.

For the reported CN comparison, the shared reviewed facts give Mid-Autumn **2026-09-25–27** within the reference **09-24–30**, and National Day adjusted rest **10-01–07** within the comparison. **09-28–30 are not joined into a holiday**. KR Chuseok **09-24–26** is separate origin context. JP **09-21–23** is a separate destination recommendation. Existing source URLs and verification dates are preserved.

## Verification

- TypeScript check passed.
- Changed-file ESLint passed.
- Production asset generation and full `vinext build` passed on Windows.
- 55 focused unit/API/calendar-render checks passed, plus 40 comparison/briefing/source-disclosure regression checks.
- Playwright comparison suite: **9 passed**, including 360/390/430/1440px, CN reference holiday overlap, 7/7 vs 6/7 observations, independent destination/origin labels, and unavailable-calendar behavior. Existing tab test now retries the action until React has attached its handler; the first run exposed this server-render/hydration test race.
- Mobile and desktop screenshots were generated from synthetic local flight fixtures and inspected. They are not screenshots of a deployed change.
- Applicable zero-cost audit: no source activation, paid service, credentials, account/auth, collection cadence, retention, D1 schema/write or forecast/outcome changes. One additional cached calendar read per opened comparison document; no polling. Existing source failure and year-boundary tests remain applicable.
- After rebasing, 16 targeted calendar/range/today-parser unit checks, typecheck, changed-file ESLint and the full build passed again. The combined Playwright file finished **19 passed**. Its first run had 4 guide-link/terminal-selection failures from initial clicks before React handlers attached. Retrying the action until its existing open/selected assertion succeeded resolved them; no production UI or expected result was changed. Holiday, range, today-comparison and airline-relocation tests all pass together.
- A broader Windows unit run had 19 failed cases outside the focused passing suites, including CRLF-sensitive workflow regexes, approved-source byte locks and existing UI source contracts. No full-suite pass is claimed. Linux CI must establish the final repository result. Working tree and task commits passed the repository credential patterns; the exhaustive reachable-history scan remained running at PR preparation.

## Release boundary

Draft PR only until coordination with concurrent UI and PR497 analysis work is complete. No merge or deployment was initiated by this task. Recheck main and CI before integration. Manual calendars still need official review when future annual arrangements are published; automatic UI linkage is not automatic official source renewal.
