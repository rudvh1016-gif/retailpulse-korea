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

No collector, provider request, data store, API key, payment, schedule, schema, deployment configuration or arithmetic change is made. Counts, official dates, URLs, country codes and source records are not translated or relabelled. Missing dates remain excluded rather than becoming zero. Flight destinations remain distinct from passenger nationality, and observed holiday-period differences do not establish causality or sales forecasts.

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
