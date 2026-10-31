# Chart motion visibility — 2026-10-30

## Recovered status and actual problem

The original chart-fill release was **completed**. PR [505](https://github.com/rudvh1016-gif/retailpulse-korea/pull/505) implemented baseline fills and [509](https://github.com/rudvh1016-gif/retailpulse-korea/pull/509) kept the passenger-mode checks aligned with subsequent navigation. Their main CI, automatic deployment and public checks completed previously (59 public checks passed / 7 opt-in checks not run).

This investigation started from main `7bdab1f21a31d4782351f246b81b0071251961ad`. On 2026-10-30 the public `/api/build` returned that exact SHA and `dirty:false`. The original CSS and shared refresh hook are present. Public Korean passenger-mode checks in Chrome at 1180×757 showed `prefers-reduced-motion:false`, `visibilityState:visible`, and the first two bars at y=972/980, below the viewport. Their CSS animation is still `chart-fill-horizontal` / `0.45s`, but the mount-time fill finishes before scrolling to them. The native update notice can cover the page during the same interval. Changing the baseline month still returns the actual stored values (July Japan 861,812; September 911,297); no missing-data or calculation repair is implied.

Older text/choice feedback was implemented and deployed in PR [363](https://github.com/rudvh1016-gif/retailpulse-korea/pull/363). It is intentionally finite and selection-triggered, not a sitewide decorative entrance. PR [464](https://github.com/rudvh1016-gif/retailpulse-korea/pull/464) intentionally removed the departure-preparation guide, so its old sequence is not restored. Static Blender art stays static. This patch does not invent text/image motion or override reduced-motion preferences.

## Narrow correction

- Reuse the existing 450ms fill, axes, marks, origins and final DOM values.
- Existing CSS remains the no-JavaScript / unsupported-observer fallback. Initially visible CSS fills are not duplicated.
- Marks first reached by scrolling or after closing a modal get one complete visible reveal, even if their mount animation already ran. Scrolling away and back does not replay them.
- Observe stable HTML tracks or SVG plots rather than scaling marks; a vertical bar does not cancel itself when its own scale moves its bounding box outside the viewport.
- Preserve same-node value-change replay. Offscreen updates wait for the next visible view.
- Reduced motion consumes the reveal without hiding data. Preference changes, document hiding, real viewport exits, modal opening and removal cancel the newly replayed Web Animations. This does **not** claim ownership/cancellation of the original CSS mount animations.
- No protected source/hash manifest, font, spacing, color, asset, dependency, API, collector, D1, schedule, permission or billing change. No new network requests. No infrastructure benchmarks or free-tier-capacity claim apply to this client-only correction.

## Validation and limits

Validation before the non-overlapping main update: full unit 2,537/2,537, production build, TypeScript and rendered HTML 53/53 passed. The latest main `7c424aeed90946c8c03379b054a30a9a1e5e2fbd` (calendar/briefing corrections) was audited and fast-forwarded without changing this patch. Final exact-head validation and CI links are recorded in the PR. `npm run health` could not start because the local tsx CLI IPC listener returned `EPERM` for `/tmp/tsx-1000/18.pipe`; no alternative launch path was used. Health must run in normal CI. Unit tests use simulated observers to cover once-only reveal, CSS deduplication, delayed entry, modal/hidden deferral, preference interruption, stable anchors and removal/reinsertion. Browser regressions cover below-fold mobile/desktop reveal, unchanged values/widths, no replay on repeated scrolling and partial-entry SVG baseline behavior. Authored browser cases are not passing evidence until the exact commit's CI executes them.

Local browser launch was not retried through another path under the existing socket/launch restriction. Public inspection uses the supported cloud browser and is evidence for the pre-fix state, not the unshipped patch. Physical iOS/Safari, true OS background-tab behavior and old-browser fallback remain unverified. Do not claim deployment until normal exact-head CI, merge/main CI, automatic deployment and public revision/interaction checks finish. Other open mobile/calendar PRs are not included.
