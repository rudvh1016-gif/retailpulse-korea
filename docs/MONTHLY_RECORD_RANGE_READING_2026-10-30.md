# Monthly record range readings — 2026-10-30

## Owner request and unchanged truth boundary

The supplied Seoul monthly-records screenshot shows daily mean population ranges. Add mouse hover and mobile tap readings for the date and its original lower–upper bound, not a midpoint or a daily visitor count. Preserve the existing missing-day marks and never turn a missing, partial, ongoing or future day into zero people.

Baseline fetched and checked: `7c424aeed90946c8c03379b054a30a9a1e5e2fbd`. A read-only path comparison against the 51 open PRs returned on 2026-10-30 found no overlap with the six implementation/test files. This does not prove every possible combination of those PRs is behaviorally compatible. The active chart-motion PR #516 does not edit this component; its `.chart-fill-y-svg` marks and the existing SVG heights, coordinates, colors and keys remain intact.

## Implementation

- A full-plot reader chooses a date from the existing SVG geometry, avoiding tiny per-day touch buttons and 31 extra Tab stops.
- Mouse hover reads the date. Click/tap holds it until Escape, outside tap/click, focus departure or cancellation. A transparent bridge keeps the tooltip hoverable across its visual gap.
- One labeled horizontal ARIA slider supports bounded left/right/up/down arrows and Home/End, with visible keyboard focus and full date/range/status in `aria-valuetext`.
- Missing, incomplete, in-progress and future dates retain distinct text. A measured `0–0` remains a real zero range. The existing lower-floor/upper-ceil person formatter is reused without changing raw data, calculations or chart geometry.
- Tooltip width is bounded to the plot, four-language instructions use the existing 12px style, and vertical touch scrolling plus pinch zoom remain permitted. No drag is required.
- Area/month loading unmounts the old reader, so stale date/value tooltips cannot survive the change.

## Local verification

- Full unit suite: 2,536/2,536 passed, including three new pointer/key tests across 28/29/30/31-day months.
- TypeScript passed. Focused changed-file lint passed; full lint has zero errors and 23 existing warnings.
- Final build passed; rendered HTML 53/53 passed.
- Full reachable-history/working-tree secret scan passed. Final changed-file credential/diff checks are required before push.
- New browser test discovery: 15 cases. Complete browser inventory: 1,975 distinct tests, four disjoint shards (494/494/494/493).
- Independent read-only review found no confirmed blocker in the six files.

## Verification still required

The new browser cases are not local browser passes. The selected environment has existing documented browser/server socket restrictions, and this task did not try another path to evade them. Exact-head CI must execute the desktop hover and keyboard cases at 320/390/1440 in all four locales, two mobile touch contexts, real-zero/missing cases, month/area changes, tooltip bounds and unchanged bar attributes. Pointer-cancel dispatch is an interruption regression, not proof of physical scrolling/pinch gestures.

Actual iOS VoiceOver, Android TalkBack, physical pinch/scroll gestures and Safari remain unverified. CI and public post-deploy screenshots must be inspected before claiming the UI release complete.

## Architecture/cost and release boundary

UI-only: no API request, collection, cache, D1 read/write, cron, dependency, credential, paid runtime, deployment configuration or protected-file change. The architecture-changing quota/benchmark gates are not applicable; no new live-source or free-tier capacity claim is made.

A newer owner instruction authorizes the earlier requested deployments. Publish only this change through the existing branch/draft-PR, exact-head CI, main integration and established deployment procedure. Coordinate the main/production sequence with the parent task. Do not force-merge, bypass a denied action, or treat pending/missing CI as passed. Preserve the exact head, CI links and deployment revision in the PR once observed.
