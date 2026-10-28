# Chinese UI audit — 2026-10-29

Scope: Simplified Chinese (`zh`, existing `简体中文` / `zh-CN` convention). Initial main: `39b7852c32d9f304a26254492a18ae94da8d7e38`. Integrated latest main / UI #498: `a314d87c9de8eb348c831aa74909f5d28c37c9d1`. Separate branch: `fix/chinese-site-copy`. No collector, API credential, account, scheduler, calculation, source-date, terminal scope, or airport-period artifact changes.

## Findings and corrections

- `airportFocusCopy` selected English or Korean only. Chinese now has its own production-shell record.
- Production and preview holiday lists, country briefings, preparation entry, arrival calculator, and staff calendar did not receive the selected language. They now do; deferred-loading placeholders inherit it too.
- New staff summaries, monthly summaries, chart tooltips/accessibility labels, calendar controls/details, source disclosures and conditions contained Korean literals. Reviewed Chinese display lookups preserve canonical Korean data keys and all arithmetic.
- Arrival data, evaluated unknown-condition messages and server review-status wording are translated at their display boundary. Traveler eligibility rules, currency amounts, age thresholds, dates, source URLs, units, and result selection remain unchanged. Unknown/unsupported conditions remain unavailable, never a zero allowance.
- Route countries remain destinations of flights, never passenger nationalities. National, regional, school, bank and institutional holiday applicability remains distinct.
- Seoul station/trade-area names have reviewed Chinese display labels. Reviewed event preview sentences have Chinese copy. Provider addresses and unreviewed full event narratives remain identifiable source originals (`地址原文`, `官方原文（韩语）`, `lang="ko"`), not silently claimed as translated UI. New provider text still requires review; no external translation service is used.

## Evidence boundaries

Source inventory and rendered checks are different evidence:

- `node scripts/audit-chinese-source.mjs <output.json>` inventories **444 app/lib source and JSON files, 5,643 Korean literal occurrences, 4,287 unique literals** in the final source inventory. This includes valid Korean locale records, canonical source identifiers, and Korean-only screens; occurrences are review candidates, not automatically Chinese leaks.
- Static tests cover every current preparation-event display field, stored arrival display data and every reachable traveler-condition result/guidance combination, runtime review statuses, calendar months/year boundary, monthly charts and missing states. All 888 reviewed mapping pairs have identical numeric token multisets (including dates, monetary amounts and placeholders); Chinese formatting preserves numeric text and source objects remain unchanged.
- The original Korean full holiday page was rendered from main `39b7852` and compared byte-for-byte with the modified default Korean render. The rendered footer baseline is committed. Existing Korean briefing fixture comparison also passes.
- A real Chrome mobile sweep visited 15 Chinese routes: home, airport, countries, preparation, more, airport news, Seoul overview, four Seoul areas, consumption, tourism desk, travel records, about. Raw provider addresses/narratives are distinguished above; language-choice names intentionally retain their own language.
- Playwright tests exercise 360px mobile and 1440px desktop: real rendering, native calendar month/country/day controls, expanded calendar source/condition details, monthly tables and chart tooltip, all twelve arrival destinations and visible condition options, language change/reload/date query, and a delayed then failed summary without fabricated zero data. Captured public 2026-10-19 counts are never relabelled as current; undated calendar tests use count-free test clock metadata.
- Screenshots and the full source inventory are local verification artifacts, not evidence of a deployed fix. This branch has not been merged or deployed. Exhaustive coverage of every future provider payload is not claimed.
- Matched frontend laboratory comparison after PR creation: three cold Chrome contexts each at 390px and 1440px, captured API fixtures, mobile 1.6 Mbps / 150 ms / 4× CPU. Windows `vinext start` returned 404 for built `/assets/`; both revisions were measured through the same localhost proxy serving their own gzip-compressed build assets. Initial transfer was 872,170 → 908,865 bytes on mobile (+4.21%) and 904,132 → 940,947 on desktop (+4.07%), within the repository's 5% comparison threshold. Mobile median FCP was 1,584 → 1,520 ms and LCP 3,504 → 3,320 ms; these are a small controlled sample, not production-user performance. The initial static JavaScript import closure increased from 302,178 to 338,866 gzip bytes (+36,688), primarily from the Chinese display dictionary. No live backend or production CDN was measured.

## Checks

- Targeted unit/render/data suites: **93 passed**.
- Supplementary source-layout, font, display-order and Chinese regression run: **61 passed** (overlaps the targeted set). Legacy source-shape assertions now unwrap display lookups for Korean compatibility; actual Chinese output is still tested separately. Nine exact localization patches restore `app/live-signals.tsx` to its original protected SHA `ff18b64c...`, so the operational UI lock does not permit unrelated edits.
- New Chrome browser suite: **5 passed** covering mobile/desktop, language/reload, terminal/date scope, and delayed/failure states.
- TypeScript: passed. Production build: passed.
- Changed-file ESLint: no errors; three pre-existing navigation/image warnings.
- Full local unit command: **2,533 tests / 2,511 pass / 22 fail**. The 22 failing titles reproduce on the untouched `a314d87c` baseline in this Windows environment (21 in the comparison run; the restored airport-period content-hash case also reproduced separately with identical hashes). The generated-period hash is affected by checkout line endings; other failures include pre-existing workflow/source assertions, importer dependencies and rendered-HTML expectations. This is not a green full-suite claim. Logs and baseline comparisons are local evidence.
- Current working-tree credential-pattern scan: PASS for all five repository patterns. The full repository secret scan also completed successfully: no high-confidence credential patterns in the working tree or reachable Git history.
- UI review used the repository frontend-design and web-design-guidelines skills. No font, spacing, sizing, or layout redesign. Chinese loading/failure messages, native controls, `aria-label`s, source provenance, and text wrapping were checked.

Architecture audit applicability: presentation-only; no added provider calls, paid dependencies, cron jobs, D1 reads/writes or schema changes. Worker/D1 production performance and source activation gates are outside this change and are not marked PASS.

Merge coordination: keep UI #498, analysis #497, holiday #501 and historical-data work intact. Shared component hunks only add language propagation/display copy. Merge and deployment follow successful checks and a fresh main review. No APPROVE review is submitted.

Draft PR #507 was opened after the user explicitly authorized completing and deploying the requested work. Its first remote run exposed Chinese calendar tests that still expected Korean and a previously hidden mixed-language New York school-scope detail. Locale-specific expectations now preserve the original date, scope and source assertions, and the scope qualifier is localized without splitting a region name containing a middle dot. Four affected Chinese mobile/desktop browser cases pass locally. The updated PR commit must pass its own remote checks before release.

The next remote country/layout job passed 312 tests but found seven failures: three locale attributes and four obsolete Korean title expectations. Arrival guidance remains Korean and is marked `lang="ko"` on English and Japanese routes; the Chinese route uses `lang="zh"` and reviewed Chinese. Four locale-specific Chrome tests pass locally with condition transitions, source disclosures, and numeric results retained. The heading check now expects the Chinese titles without relaxing wrapping, accessibility or 200% enlargement checks. On Windows Chrome, the unchanged 200% heading height assertion fails on the same heading in both the candidate and untouched main `a314d87c`; this local result is not a Linux CI pass.

Rebased onto main `1d52ed58` after holiday PR #501 merged. Chinese labels distinguish announced nationwide rest intervals from unclassified nationwide holiday schedules, state that not every day is a statutory holiday, and mark listed makeup workdays as not holidays. The official response and fallback classifications are separately checked without changing dates or the classification logic.
