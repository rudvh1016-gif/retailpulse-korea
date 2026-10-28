# Chinese UI audit — 2026-10-29

Scope: Simplified Chinese (`zh`, existing `简体中文` / `zh-CN` convention). Initial main: `39b7852c32d9f304a26254492a18ae94da8d7e38`. Separate branch: `fix/chinese-site-copy`. No collector, API credential, account, scheduler, calculation, source-date, terminal scope, or airport-period artifact changes.

## Findings and corrections

- `airportFocusCopy` selected English or Korean only. Chinese now has its own production-shell record.
- Production and preview holiday lists, country briefings, preparation entry, arrival calculator, and staff calendar did not receive the selected language. They now do; deferred-loading placeholders inherit it too.
- New staff summaries, monthly summaries, chart tooltips/accessibility labels, calendar controls/details, source disclosures and conditions contained Korean literals. Reviewed Chinese display lookups preserve canonical Korean data keys and all arithmetic.
- Arrival data, evaluated unknown-condition messages and server review-status wording are translated at their display boundary. Traveler eligibility rules, currency amounts, age thresholds, dates, source URLs, units, and result selection remain unchanged. Unknown/unsupported conditions remain unavailable, never a zero allowance.
- Route countries remain destinations of flights, never passenger nationalities. National, regional, school, bank and institutional holiday applicability remains distinct.
- Seoul station/trade-area names have reviewed Chinese display labels. Reviewed event preview sentences have Chinese copy. Provider addresses and unreviewed full event narratives remain identifiable source originals (`地址原文`, `官方原文（韩语）`, `lang="ko"`), not silently claimed as translated UI. New provider text still requires review; no external translation service is used.

## Evidence boundaries

Source inventory and rendered checks are different evidence:

- `node scripts/audit-chinese-source.mjs <output.json>` inventories **441 app/lib source files, 4,567 Korean literal occurrences, 3,542 unique literals** at the initial scan. This includes valid Korean locale records, canonical source identifiers, and Korean-only screens; occurrences are review candidates, not automatically Chinese leaks.
- Static tests cover every current preparation-event display field, stored arrival display data and every reachable traveler-condition result/guidance combination, runtime review statuses, calendar months/year boundary, monthly charts and missing states. Chinese formatting preserves numeric text; source objects remain unchanged.
- The original Korean full holiday page was rendered from main `39b7852` and compared byte-for-byte with the modified default Korean render. The rendered footer baseline is committed. Existing Korean briefing fixture comparison also passes.
- A real Chrome mobile sweep visited 15 Chinese routes: home, airport, countries, preparation, more, airport news, Seoul overview, four Seoul areas, consumption, tourism desk, travel records, about. Raw provider addresses/narratives are distinguished above; language-choice names intentionally retain their own language.
- Playwright tests exercise 360px mobile and 1440px desktop: real rendering, native calendar month/country/day controls, expanded calendar source/condition details, monthly tables and chart tooltip, all twelve arrival destinations and visible condition options, language change/reload/date query, and a delayed then failed summary without fabricated zero data. Captured public 2026-10-19 counts are never relabelled as current; undated calendar tests use count-free test clock metadata.
- Screenshots and the full source inventory are local verification artifacts, not evidence of a deployed fix. This branch has not been merged or deployed. Exhaustive coverage of every future provider payload is not claimed.

## Checks

- Targeted unit/render/data suites: **93 passed**.
- New Chrome browser suite: **4 passed** before final main integration.
- TypeScript: passed. Production build: passed.
- Changed-file ESLint: no errors; three pre-existing navigation/image warnings.
- Secret scan: running across reachable history at the time of this record; final result belongs in the PR.
- UI review used the repository frontend-design and web-design-guidelines skills. No font, spacing, sizing, or layout redesign. Chinese loading/failure messages, native controls, `aria-label`s, source provenance, and text wrapping were checked.

Architecture audit applicability: presentation-only; no added provider calls, paid dependencies, cron jobs, D1 reads/writes or schema changes. Worker/D1 production performance and source activation gates are outside this change and are not marked PASS.

Merge coordination: keep UI #498, analysis #497, holiday #501 and historical-data work intact. Shared component hunks only add language propagation/display copy. Merge/deployment and any APPROVE review submission remain withheld for parent coordination.
