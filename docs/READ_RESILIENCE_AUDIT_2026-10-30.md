# KORETAIL read resilience audit — 2026-10-30 KST

## Scope and starting revision

The owner requested performance, calculation, code and stability checks while expressly preserving the site's design and content. Starting main and observed production `/api/build` both identified `df29452349fe0b8b979fac503f5bf712cf140da8` (PR #511). Open design/content/data PRs were not integrated.

This change preserves existing JSX, copy, styles, images, arithmetic, source data, API routes, collector policies, schedules, the production deployment workflow and cost policy. CI execution is reorganized without reducing its coverage or release gates. A TypeScript AST comparison of all nine changed TSX files found their outermost JSX expressions byte-identical to the starting revision. Existing protected-file hashes were renewed only for the three transport edits; `tests/fixtures/phase2-locks.json` retains their before/after hashes and exact unified diffs.

## Defects corrected

1. **Unbounded auxiliary reads.** Monthly records, prediction evidence, customs news, recent FX, the Seoul toilet directory, airport facility searches and operations could remain pending without a deadline. They now have a 15-second deadline including response-body consumption, use their existing failure presentation, and cancel obsolete requests on selection change/unmount. The allowance status read has the same bound without altering its reviewed values or guidance. Existing 404 facility-operation semantics are preserved.
2. **Prepared-month read-ahead bypassed cancellation.** The original prime fetch did not own an abort signal. Once its response headers were handed to a hook, the hook's timeout could not stop `response.json()`. Unused primes could also accumulate. Read-ahead now parses inside its own deadline, is consumed once within ten seconds, forwards selection cancellation, aborts stale/evicted requests, and holds at most eight URLs. The original three-attempt selection policy and same-key last-good behavior remain.
3. **Event pagination identity and cursor validation.** An immediate repeated click could reuse a stale render's loading flag, and a response from an earlier visit to the same area/date could be accepted later. One in-flight controller now gates duplicate clicks and identifies the current request, with cancellation when its selection ends. A non-advancing, absent or invalid next cursor fails rather than appending rows and inviting the same page repeatedly. Existing event identity deduplication is preserved.
4. **Repeated full-history secret scans.** The previous main CI spent 653 seconds scanning each reachable tree separately for each of five patterns. The same five expressions now share one `git grep` traversal per tree. The working tree, untracked files, all reachable revisions, binary/path exclusions, exit-on-finding and error handling remain covered. New temporary-repository tests cover every pattern, a renamed/deleted historical credential, redacted output, and the exact existing exclusions. The secret-scan step passed in 254 seconds on intermediate head `4057c0a`, run [41048093558](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41048093558): 399 seconds shorter than the preceding main run. This is a two-run observation, not a guarantee for all runners; the overall workflow was not yet complete when measured.
5. **Serial browser verification bottleneck.** The preceding main CI spent 2,237 seconds on its full browser step. A discovery-only job now proves the four partitions cover all 1,951 cases exactly once (488/488/488/487). Its validated indices and total directly define the actual matrix, so they cannot drift from the inventory check. All four browser jobs wait for the existing verify/critical-UI gate; they retain the original suite, retry policy and timeout, run on standard public-repository runners with read-only permissions, and upload separately named evidence with the existing seven-day retention. `fail-fast: false` keeps evidence from every partition. The unchanged production deploy workflow still requires overall successful CI for the exact current main push; any failed partition blocks that success.

These are reads of existing stored endpoints only. No new provider calls, schedulers, paid services or automatic retries were added.

## Local verification

| Check | Result |
| --- | --- |
| Baseline `npm run test:unit` | 2,506 passed |
| Final `npm run test:unit` | 2,520 passed, including scanner and partition-coverage regressions |
| New deadline/read-ahead fault tests | 8 passed; stalled headers/body, cancellation, expiry, capacity, recovery |
| Secret scanner regression tests | 3 passed; all five patterns, deleted history, redaction and preserved exclusions |
| Actual browser partition inventory | 1,951 cases; complete union, no duplicates; 488/488/488/487 |
| `node --test tests/rendered-html.test.mjs` | 53 passed |
| `npm run build` / `npm run typecheck` | Passed |
| `npm run lint` | 0 errors, the same 23 pre-existing warnings |
| `npm run secret:scan` | Passed |
| `bash scripts/audit-production-deps.sh` | 0 reported production dependency vulnerabilities |
| Protected UI and scheduler checks | Passed; no schedule changes |
| Read-only offline health | No runtime LLM findings or duplicate scheduler finding; live enablement/quotas remain UNKNOWN without account evidence |

Four browser regressions in `e2e/stored-read-resilience.spec.ts` cover stalled news, records and facilities returning to existing error/retry flows, and invalid event cursors. Their authoritative execution and the full browser suite are recorded in the associated PR's CI, not inferred from the local unit results.

The managed preview returned its page HTML but failed to fetch the Vite virtual browser entry (`Failed to fetch dynamically imported module … /@id/__x00__virtual:vite-rsc/entry-browser`). Local interactive browser QA is therefore unverified. No working application/network configuration was altered to compensate; preview was stopped. GitHub's existing browser/deployment checks remain required before release.

## Live read-only observations

The origin `https://koretaildata.com` was probed around 20:00–20:14 KST, before this change was released.

* 22 known page/API URLs returned HTTP 200; an unknown page returned HTTP 404. Includes all four home locales, airport/country/preparation/news, the four Seoul areas, consumption, records, More, and the relevant stored APIs.
* The flight endpoint returned 546 departures with 546 unique physical flight IDs and `truncated: false`. Counts T1 153 + Concourse 135 + T2 258 = 546 matched the summary.
* Official departure forecast T1 56,532 + T2 45,459 = 101,991. Separately stored expected transfer counts 520 + 9,836 = 10,356; the existing simple combined figure is 112,347. This verifies the sum, not passenger identity deduplication or observed actual passengers.
* Both terminal forecast coverage flags were COMPLETE. Prepared October flight history and the latest published September official passenger statistics answered READY. The calendar returned VERIFIED with 266 events; customs news returned STORED with 12 items. Data/API availability does not by itself prove every browser component rendered it.
* Production visual run [41040676014](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41040676014) reported 59 passed before this change. Its mobile sample recorded LCP 2,280 ms and real data at 3,676 ms; these are lab samples, not all-user percentiles or this patch's speed improvement. Executor curl samples include its proxy/network path and are not comparable to those browser timings.

## Source failures that must remain visible

* **A1 detailed flights:** daily run [40981962781](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/40981962781), collection job 123823902550, stopped at `A1_TODAY_POPULATION_CHANGED_PAGE_32`. The upstream row population changed during pagination. Last-good canonical records from 01:24 KST remained. Bypassing the completeness validation, stamping these records as newly collected, or spending an unverified additional daily scan would not be a safe repair.
* **KASI public holiday source:** the same run recorded `SKIPPED_AUTH_COOLDOWN`, preceding HTTP 403/AUTH refusal, and no newly written rows. The owner needs to inspect the data.go.kr application for dataset 15012690 (approval and access period). The separate reviewed annual calendar is still available; KASI failure does not mean all calendar data is absent.
* **Seoul real-time sources:** run [40991322190](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/40991322190), job 123854168004, recorded eight TIMEOUT attempts across four areas; later health reads showed stored rows with STALE flags. Retrieved time and provider observation time must remain distinct. No source values or timestamps were manufactured to clear those flags.

## Proposed next improvements

1. Verify the A1 provider's supported pagination size and quota contract before proposing a smaller number of pages/shorter scan. Prove unchanged completeness and bounded shared request spending first; keep fail-closed validation.
2. Restore KASI authorization through its official application; use the existing single-source verification path after it is fixed. Do not rerun unrelated airport collectors.
3. Measure current official Worker CPU/request and D1 read/write/storage usage before claiming a free-tier capacity. Review restore evidence in staging; a recovery bookmark is not a completed restore drill.
4. Measure the four browser partitions after this release and rebalance only from observed durations while retaining the complete inventory proof. Existing production/deploy ordering and stale-revision rejection stay intact.
5. Consolidate the remaining stored-read implementations only with behavior/timeout evidence. Review the 23 existing lint warnings separately; replacing images or navigation solely to clear warnings can change loading or history behavior and should not be mixed with a transport-only release.

Merge, deployment identity, post-release visual checks and any final limitations are updated in the associated PR. A merged PR alone is not proof of production deployment.
