# Airport home footer spacing

## Request and change

Remove the excessive empty area between the home page's official airport map link and the site footer. The embedded overview inherited standalone-preview bottom navigation clearance (100px on phones, 40px on desktop), then added the outer insight padding and site-footer margin. The real page shell already reserves clearance after the footer for the fixed mobile navigation.

`app/airport-period-insights.css` removes those duplicate bottom paddings only inside the live home overview and uses one 24px gap before the site footer. Standalone previews, other page types, typography, source links and the page shell's mobile safe area are unchanged. There are no collector, scheduler, API, D1 or paid-runtime changes.

## Verification

Baseline: `6778652ec2b342927376c02990ad5c3935a5abad`.

- `npm test`: passed, including the production build, 2,850 unit tests and 54 rendered-HTML tests.
- `npm run lint`: passed with 25 existing warnings and no errors. An initial run inspected generated Playwright cache files; moving that task-generated cache outside the checkout removed the unrelated errors.
- `npm run typecheck`: passed.
- `npm run secret:scan`: passed.
- `node --import tsx scripts/health.ts`: harness execution passed; production/system verdict remains UNKNOWN without production credentials. The `npm run health` wrapper could not open its local IPC socket in this environment.
- `node scripts/check-browser-shards.mjs`: 2,340 tests, complete and disjoint across four 585-test shards.
- Independent static review found no actionable selector, cascade or design-guideline defects.
- Added `e2e/airport-footer-spacing.spec.ts` for 360, 390, 430, 820 and 1440px widths: compact source-to-footer gap, repeated tab return, retained mobile navigation clearance and no horizontal overflow.

Local Chromium could not launch because the execution environment rejects its socket syscall, including after escalation. The managed browser could not connect to the local server. Consequently no local visual pass or successful red/green browser test is claimed. The new regression cases are included in the mandatory full browser-regression CI shards. Exact-head CI must pass before merging. Merge, deployment and live verification are recorded in the pull request after they occur.
