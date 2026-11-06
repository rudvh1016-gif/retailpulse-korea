# Notice repeat-click landing follow-up

## Observed production failure

PR #586 uploaded main `0f80167df067fc9bc82b362406ae4903f764e2b7` in Deploy run [42191294416](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42191294416). Revision checks before/after matched, dirty=false. The new mandatory release gate correctly failed; this was **uploaded, not a verified release**.

At both 390 and 1440 px, first actual click, passenger mode, live selected month/Japan departures, Back and Forward passed. The failure was the following same-URL notice reopening and actual re-click (production spec line 23). `arrived` alone was false; heading and first row were visible, unobstructed, and scroll unlocked. This was not a missing API/table or a tolerance rounding issue.

An analytics-opted-out live diagnostic recorded mobile target top `67.578125` / scrollY `527`, an instant correction, then approximately 350 ms later vinext `scrollToHashTarget` calling `scrollIntoView({behavior:'auto'})` (`index-A7p0JS7A.js:3:34782`). Target top settled at `161.578125` / scrollY `433`. Source inspection identifies the deferred history restoration path. Its pending scroll may finish after the first geometric assertion and the next click. Mutation/resize observers cannot see a scroll when layout is already settled.

## Minimal correction and regression

Only the scoped passenger hash reveal observes scroll while its existing landing correction is armed. Existing wheel/touch/pointer/key stop events and the eight-second limit still end it. The shared hook's unscoped airport callers retain their behavior; no router or product copy changes.

The fixture journey waits for prior layout settling, then reproduces the measured delayed `scrollIntoView(auto)` after actual notice re-click. **Before the correction, both 390/1440 failed** (`notice-repeat-red-quiet.log`, original one-country fixture). The final fixture also exercises a full 58-country synthetic table and successful comparison response, selected using the describe title path; this covers table length as well as the demonstrated timing gap. A reader wheel then verifies that alignment does not fight deliberate scrolling.

The shared landing contract retains the exact header-relative 0–32 px band and table/mode/visibility/hit/overflow checks. It additionally requires 750 ms of stable arrival, and attaches geometry in `finally`, including failures. Every production landing checkpoint supplies test info. No destination scrolling is performed by the assertion. The explicit delayed restoration belongs only to the fixture regression; the live gate uses real routing and APIs.

Existing dedicated/full CI and strict deployment gate from #586 remain mandatory, with no retries or failure allowances added. Final CI, deploy SHA and live outcomes are recorded in the PR and workspace status when observed.

Local verification: typecheck PASS; lint zero errors / 25 existing warnings; full unit 2826 PASS; production build PASS; rendered HTML 53 PASS; related browser suites 90 PASS, including delayed restoration and deliberate reader scrolling. Independent read-only review found no critical/important issues. The pre-fix two-viewport failure and corrected success are preserved in workspace evidence. The local Windows vinext static-path workaround serves unchanged built/public assets and proxies dynamic requests; Linux CI and actual public release checks remain authoritative.

The separate obsolete About smoke marker is deferred until this release gate succeeds. No official monthly values or burgundy notice styles were changed.
