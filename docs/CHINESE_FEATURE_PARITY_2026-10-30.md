# Chinese airport feature parity — 2026-10-30

## Request and baseline

The owner asked that menus, content and functions added in Korean also appear in Chinese. The two supplied screenshots show the old Chinese passenger-only country page and glance without analysis tabs. Both reference images were inspected directly. The smaller gray-note typography is a separate, coordinated change in PR #519, not part of this patch.

The prior copy audit, PR #507, is already merged. It explicitly left the new Korean analysis tabs and country-zone/flight pages without Chinese equivalents. Its stopped task is not an ongoing implementation. This patch was integrated with main `0f4c87efd91521c05b42aa2ebc0b5da19689df07` and closes those specific feature gaps rather than repeating the previous 15-route translation sweep.

## Changes

- Chinese glance has the same five tabs: overview, hourly concentration, weekday/weekend, terminal and holiday comparisons.
- Chinese country trends has the same three tabs and default: departure zones, official monthly passengers and flights. Flights includes both custom periods and monthly terminal comparisons.
- The original Chinese overview and passenger charts remain available, with no duplicate page heading. Passenger-context links explicitly choose the passenger tab.
- Chinese airport/concourse/glance links now lead to the corresponding country-zone view with the same date and building. The moved country rankings are not duplicated on the airport page.
- The iframe has a Chinese static loading document, all comparison controls, numeric units, chart labels, accessibility names, methodology, empty/error/retry messages and reviewed official holiday names.
- The iframe retains the existing country-jump protocol and same-origin/source checks; jumps stay in the selected language. A language change remounts the localized frame while preserving the URL's dates, mode and selected analysis.
- Country-month sorting, search, expansion, zone detail, source details and unavailable states have Chinese copy. Chinese usage guide and About use the same airport-focused sections as Korean.

## Invariants and boundaries

No collector, provider request, data store, API key, payment, schedule, schema, deployment target or arithmetic change is made. The exact Chinese frame URLs receive the same strict same-origin framing policy as the existing Korean frame; application pages retain DENY. Counts, official dates, URLs, country codes and source records are not translated or relabelled. Missing dates remain excluded rather than becoming zero. Flight destinations remain distinct from passenger nationality, and observed holiday-period differences do not establish causality or sales forecasts.

The analysis renderer translates exact presentation literals before DOM insertion, not a post-hydration text rewrite. Numeric tokens, markup/control attributes and the static iframe control tree have parity tests. Korean feature behavior remains unchanged. A subsequent owner screenshot request also shortens gray comparison notes in both languages without removing calculation/source limitations; English and Japanese retain their prior screens. Unknown future Korean provider holiday names are explicitly labelled as Korean originals instead of receiving an invented translation.

Existing self-hosted Chinese fonts are reused. Analysis assets are still lazy: the overview does not create an iframe or request analysis history. No third-party translation or runtime AI service is introduced.

## Verification

Added unit coverage checks every analysis display literal, source/numeric/control preservation, all current verified national holiday names, ko/zh tab parity and unchanged en/ja wrappers. Country/guide tests cover language propagation, whole-number/strict-small-change bounds, non-finite/missing data and the same four guide links. Protected-file hashes are unchanged; exact owner-requested guide edits are reversed by a scoped fixture before the original hash assertion.

New Playwright cases cover all five analysis views at 320/390/1440 px, country jumps, terminal selection, sorting, date/locale round trips, retries and missing-record states. Additional cases cover country-month search/sorting/expansion, zones, source disclosures and guides. The old Chinese passenger-chart test now selects `mode=passengers` explicitly; its existing assertions remain intact.

Local browser execution is not used as evidence: the earlier environment refusal is respected. A helper began a local invocation before receiving that history, then immediately stopped it (exit 130); no browser test result was obtained and no related process remained. Real interaction and screenshot evidence must come from normal PR CI. Do not describe this patch as deployed until exact-head checks, the normal merge/deployment and the public version are verified.

## Later mobile-note request

The third screenshot (IMG_1717) was also inspected directly. Its holiday-color explanation is now a short shared key: gray is baseline, blue is comparison, neither indicates holiday status. It is 10px on phones, with natural wrapping (no clipping, ellipsis or forced no-wrap) when text is enlarged. Secondary comparison notes across all five iframe views are concise and 10px on phones. Source completeness, actual included days, missing dates, nationality scope, causality and sales limitations remain visible or in their existing methodology disclosure. Desktop font sizes are unchanged. The React-page gray-note audit remains coordinated separately.

## Local pre-PR results

On the integrated tree: build and typecheck pass; lint has 0 errors (24 existing warnings); 2,551 unit tests pass with test concurrency bounded to 4; all 53 rendered-HTML checks pass; secret scan passes. An unbounded local run under concurrent build load timed out in the unrelated existing GC probe; it passed in isolation and in the full bounded run without changing its 10-second assertion. Browser discovery has 1,999 unique tests in four complete disjoint shards; 22 newly added cases are discovered, not yet executed.

## Initial PR CI and corrective audit

PR #523, head `4f7ac3ad922baf746ffc5e59da4cf45751bfaa63`, ran normal remote CI [41090723313](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/41090723313). Build/typecheck/secret scan, 2,551 unit cases, 53 rendered-HTML checks and five critical browser cases passed. The full 1,999-case browser suite had 42 failures (1,957 passed); the overlapping 81-case country job had five failures (76 passed).

The failures exposed one genuine integration omission: the new Chinese frame was blocked by the global framing policy. The correction adds only its three exact static/normalized paths to the existing strict SAMEORIGIN CSP in both application headers and Workers asset headers. External framing and application-page framing remain forbidden. Rendered-header checks cover both locales, both serving paths and an unreviewed document path.

The remaining failures were old Chinese routes that still expected country rankings inside the airport page, two old shortened-copy expectations and a new guide test whose button name omitted its visible arrow. Tests now follow the same ko/zh country-zone route and localized controls without removing numeric, source, font, keyboard or geometry assertions. The initial real browser run already passed the shared holiday-key sweep for all 50 stored destinations in both languages at 320/360/390/430px, enlarged-text wrapping, and desktop/missing-data boundaries. Chinese 320px and Korean 360px artifact screenshots were inspected directly. The corrected final head still requires fresh remote CI; this is not a deployment claim.

The correction was independently reviewed read-only for header scope, unchanged assertions and exact Chinese iframe expectations. Local rebuilt rendered checks pass 53/53, affected unit/security/protected-file checks pass 64/64, typecheck passes and scoped lint has zero errors/warnings. The first protected-file run correctly rejected the newly appended asset headers; an exact added-block reverse fixture now preserves the original hash instead of replacing it. No browser/server was started locally.
Working-tree and all 340 reachable-history revisions pass the full secret scan. Browser discovery still reports the same 1,999 tests in 152 files; no test was removed or skipped to clear failures.
