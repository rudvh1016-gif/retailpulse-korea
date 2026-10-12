# Release integration preparation — 2026-10-12

## Boundary and current blocker

This is a LOCAL integration plus draft review, NOT a public release. At start origin/main was `0659f80703fb6e0d0d96e8380d16b175aa6dad67`. Automatic approval review rejected the combined `gh pr ready 347` / `gh pr merge 347 --merge --match-head-commit ...` action: the direct user instruction prohibited merge/deploy, and the subsequent approval was only inside a delegated tool message. Neither operation was executed. No bypass/retry, workflow dispatch, public merge or deployment was performed. A direct user approval question is pending.

Local merge order (all conflict-free):
1. #347 `8f501c02bf473de66b968332addd646e0acf5e1c`
2. #352 `2173e76cf5128c4dfd7f327896a1c5e0e30bbcf1`
3. #353 `9bf38eea3b89cf9fe0e7898dd82b0beb7e1c7a18`
4. #348 `42ab6a3e6d5300d2a2ccead2fc599d363f64e373`
5. #349 `6f1e2d66e1d19e4aa8f3da779c05406820d94a86`
6. #350 `d11e7c14798daa94800390d516e453832b672369`

All six exact heads had successful remote CI when checked. Their passing suites were not manually rerun. #343/#346 and other open PRs are excluded. PR347's monthly projection is preserved and shared by the preview and detailed monthly display.

## Prepared menu/public route changes

The proposed public path `/{locale}/airport-glance` uses the existing shared safe-area header and footer navigation. It lazy-loads the approved glance component, removes its redundant standalone header/preview badge only on this public route, and retains the preview route for historical review. No new data engine or collection.

Mobile: 공항 한눈에 → 공항 → 서울 한눈에 → 서울 → 소비 흐름 → 더보기.
Desktop: 공항 한눈에 → 공항 → 서울 한눈에 → 서울 → 소비 흐름 → 매장 → 더보기.
More retains explicit store/guide/records/about links. Desktop store remains directly visible. Concourse detail links now use the detailed screen's existing `building=CONCOURSE` parameter instead of an unsupported terminal value.

## Validation

- New navigation cases: 7 PASS (KO360/390/430/1440, EN/ZH/JA390). English/Japanese initially expected the full Seoul label instead of the existing shortened visible label; corrected the test to compare the accessible name, reran only those two failures: PASS.
- Existing mobile bottom-navigation scroll/resize cases: 12 PASS, four languages at 360/390/430.
- Typecheck and native vinext production build: PASS. Initial build command used the wrong CLI path; the package-declared dist/cli.js completed successfully.
- Scoped lint: zero errors/two existing img advisories. Diff check PASS.
- Saved-response PC1440/mobile390 capture verification: PASS, decoded image, correct 563/158/142/263 counts and 27/3/7/17 window scope, no page errors/overflow. Four screenshots in `docs/screenshots/approved-release-navigation-20261012`, visually reviewed.
- Owner UI Lock targeted test: FAIL as expected because four proposed protected-file changes have not been approved/recorded. The lock fixture/test/protected list are unchanged, not disabled. Exact before/after hashes and diff: `docs/approvals/approved-release-navigation-pending-20261012.json`.
- No new performance measurement or public-site verification is claimed.

## Resume only after direct approval

Approve the concrete changes to app/[locale]/[slug]/page.tsx, app/globals.css, app/retailpulse-app.tsx and app/seo-config.ts, and the corresponding normal approval record/hash updates. Then update only those authorized hashes, rerun the targeted lock test, obtain required CI on the integration head and use the existing guarded deployment workflow. Do not weaken checks.

This branch already contains all six PR heads. Choose one coordinated integration path and do not apply duplicate changes. If individual PRs are merged, transplant only the menu preparation commit onto the resulting main. Verify final remote main SHA, deployment SHA and public PC/mobile navigation before claiming release complete. Public permission is still blocked in this execution environment.
