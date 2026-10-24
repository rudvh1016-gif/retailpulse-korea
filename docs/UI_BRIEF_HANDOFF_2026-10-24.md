# Compact airport briefing — 2026-10-24

Base main verified twice through the GitHub connector: `5cf21f4fb7cd37c662ca2511e77b25722411b64d`.

## Result

- Today’s notable changes, next week and next month share compact white information cards, bold dark titles and thin rules.
- Event flag/title and civil dates precede separately labelled selected-day flights and the numeric daily-average comparison baseline.
- Future planning cards retain selected-day flight references inside closed date details, with an explicit non-forecast label. Existing monthly route-passenger context remains visible.
- Monthly comparisons and waits distinguish key values from supporting text. The existing country/composition introduction is preserved in a closed native disclosure.
- Monthly provenance first shows periods, included-day totals, excluded-day counts and cancellation counts. Original dates, reasons, terminal totals, source/version information and links remain in a second closed disclosure.
- Only the arrival summary passes `showModel={false}`. Its timeline and statistics, the departure model slot and departure map remain.
- Existing today headline sizes remain mobile 24px / desktop 28px, changes 16px. Future flight-reference values are capped at 24px / 26px.

No collector, formula, source data, authentication, analytics/PR470, customs-news suppression, Singapore verification date, country-flag asset, scheduler or deployment change.

## Verification

- `npx tsc --noEmit`: passed.
- `npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .playwright-browsers --ignore-pattern .npm-cache`: zero errors, 16 existing warnings. Last changed TSX/test files also linted separately.
- `node scripts/secret-scan.mjs`: passed.
- `npx vinext build`: passed. The repository bash wrapper could not start in this Windows sandbox (`NtCreateDirectoryObject ... 0xC0000022`), so its underlying build CLI was used directly.
- `node --test tests/rendered-html.test.mjs`: 51 passed.
- Six focused briefing/calculation test files: 37 passed, including the new future-date, disclosure and arrival-model regressions.
- `node --experimental-sqlite --import tsx --test tests/incheon-airport-stats.test.ts tests/operational-phase2.test.mjs`: 110 passed after correcting Windows test-path normalization and recording the exact owner-authorized UI hashes/diffs.
- `npx tsx scripts/health.ts`: exit 0; harness execution PASS, system verdict UNKNOWN, no production database supplied. This is not evidence of production collection enablement.
- Full suite: 2,357 tests, 2,352 passed, 5 failed. The localization snapshot failure was corrected by showing the flight-reference summary only with an actual flight context; localization plus new regressions then passed 7/7. Four local workerd/D1 cases remain blocked by EACCES 127.0.0.1. They are not passed.
- Browser/E2E and screenshot inspection were not attempted, respecting the existing browser-path restriction.

The initial Windows clone converted files to CRLF, causing source-regex and approved-input byte-hash failures. Unchanged checkout files were restored byte-for-byte from HEAD using `git cat-file --batch`, without a repository data diff; local autocrlf is now false. The byte-lock fixture changes record only the two approved UI files and their exact diffs. No broad guard was removed.

## Review and recovery

Review the draft PR before merge/deployment. Root manages deployment. The remote PR/commit and local bundle/patch are the recovery entry points; do not reuse previous cloud test claims.

Native `details/summary` controls preserve keyboard interaction, 44px targets, visible focus, source evidence and missing-data states. React/UI guideline review introduced no new requests, dependencies, effects, collectors or mutable calculation state.

## PR473 review follow-up

- Updated the composition E2E selector to the visible summary instead of a paragraph moved into closed details. Kept every existing spacing upper bound; added non-overlap bounds, a 44px summary target, pointer open/close, keyboard Enter close, preserved text and opened-state overflow checks at the existing six viewport widths.
- Updated event E2E expectations to explicitly require title → event date paragraph → selected-day flight comparison, and to require both the partial 2/30-day baseline and its 5-flight mean. Existing missing, zero, partial-flight and unrelated-country truth assertions remain.
- Updated the Japanese planning summary expectation to the exact appropriate label with/without a selected-day flight reference. Added static rendering coverage for both states.
- Separated country flight counts from secondary shares and made the unpositioned count explicit in both country and gate disclosures. Kept the country flags, all count/share expressions, ranks, denominators and lazy unpositioned rows unchanged.
- Refined monthly zone table typography/alignment without changing row values. The section title uses compact 18px text, previous/current columns use 14/16px and changes retain 16px.
- Added a short first-level source summary: the existing calculation timestamp formatted in Asia/Seoul plus a source link. Original ISO, full dates, reasons and version metadata remain inside the existing inner disclosure.

Follow-up checks: typecheck and changed-file lint; 107 focused unit/static/render checks; build plus 51 built HTML checks; Playwright collection lists 78 cases across the three corrected E2E files. Browser execution was not attempted. Existing loopback/D1 limitations remain separate from this test correction. Final commit/CI links are in PR473.
