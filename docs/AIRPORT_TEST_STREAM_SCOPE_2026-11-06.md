# Hydrated airport test scope

This separate harness-only follow-up changes the two existing airport measurement tests, not the product, design, router, notice or data. The notice release remains verified in production at `82735a2aa933df33cd2149b2a844449e654f5fc6` (strict actual click 2/2 and full Visual 84/84). About PR #588's official Site Smoke [42209106058](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42209106058) passed all 59 core checks. Its main `c107c84…` deployment was blocked by an existing date-controls failure, not the About contract.

## Evidence and cause

- About PR CI [42204240877](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42204240877): midnight-consumption zh390 detached a global news-entry locator. First shard3 failed; one bounded job rerun succeeded with the same case marked flaky. The same commit's dedicated 345-case job passed. This instability was preserved, not claimed fixed by that rerun.
- About main CI [42209064261](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42209064261), dedicated job127862908750: date-controls zh430 found two `#airport-data-flow` nodes in both attempts (344 passed). Artifact [13498347938](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42209064261/artifacts/13498347938) was retained. No further CI retries were requested.
- Retry trace snapshot `after@call@14`, time118492.578: the selector was under `BODY > DIV[hidden]#S:0 > SECTION.airport-view`. At `after@call@20`, time118786.596, it was in `BODY > DIV.app[data-hydrated=true] > MAIN.page-shell`. The screenshot showed one normal visible control group. Global page locators were reading React's pending streamed payload alongside the live app; root hydration alone did not exclude it.

## Narrow regression and correction

The known zh430/zh390 cases now deliberately hold a hidden streamed clone outside the hydrated app. The fixture asserts two global control nodes but exactly one in the actual app. **Before scoping, both cases failed** (`airport-stream-red-dom.log`). The queries now read only `.app[data-hydrated="true"] main`; news-entry visibility is awaited before scrolling. **After scoping, both passed** (`airport-stream-green-final.log`). An intermediate run also caught remaining global label/date-nav assertions, which were scoped consistently.

Every prior count, geometry, style, minimum size, image resolution, href, focus, T1 interaction and keyboard assertion remains. Strict uniqueness within the live app remains: duplicate live controls still fail. No `.first()`/`.nth()` workaround, ignored assertion, retry increase or timeout increase was added. Independent review confirmed the final scope; full-suite/CI outcomes are recorded in the PR and workspace status.

Local checks: focused hidden-stream regression 2/2 PASS; typecheck PASS; lint zero errors / 25 existing warnings; full unit 2836 PASS; SSR render 54 PASS; full-history secret scan PASS. Both affected browser files were run in full: 58 passed / 2 failed. The failures are unchanged native date-field keyboard tests (year/day segment order) on Windows; the original `c107c84` file reproduced both failures as well. Their code and CI coverage were left intact. Linux CI remains required before merge; this record does not describe the local 60-case run as fully passing.
