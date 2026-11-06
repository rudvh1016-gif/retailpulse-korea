# About smoke contract correction

The separate Production Site Smoke run [42182242131](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42182242131) failed only `about page is live` with HTTP 200. It searched for the old `KORETAIL은 무엇인가요` text. Korean AboutView renders a different current introduction and four `visibleSections`; the old text remained in an unused language fallback array. This was a stale test expectation, not missing About content or a general API failure.

Primary notice navigation work was completed first in PR #587: production `82735a2aa933df33cd2149b2a844449e654f5fc6`, Deploy [42202329418](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42202329418) SUCCESS, strict real-click gate 2/2 PASS. This follow-up changes only the smoke contract, its tests and this record; no product copy, CSS or data changes.

The predicate now requires HTTP 200 and real `<main>` content: current h1, source/date introduction, and all four About sections with their meaningful body text. Scripts, styles, templates, comments, metadata and the brand word alone cannot satisfy it. Keeping the small predicate inline is intentional: this workflow checks out the last deployed revision to derive that revision's page markers, which may not yet contain a newly added helper file.

Regression tests execute the exact workflow predicate: **before 6 passed / 4 failed; after 10 passed**. They cover current content without the obsolete marker, missing intro/heading/each section/each body, unsuccessful responses and non-content spoofing. A rendered-HTML test applies the same predicate to the actual built `/ko/about` so future product-copy changes must keep this contract in sync before deployment.

Read-only production check at **2026-11-06T10:34:28.324Z**: HTTP 200, build `82735a2…`, dirty=false, current title `인천공항의 흐름을 한눈에`, old marker absent, new predicate PASS. The full workflow's other checks remain unchanged. Final CI and official operating-smoke results are recorded separately in this PR and workspace status.
