# KORETAIL dependency security review — 2026-11-01

## Scope and deployment boundary

Baseline/latest fetched main: `e96a5017e3b89b59900d75a120982f198facb501`. Work performed in an independent clone on `fix/security-rsc-audit-20261101`. `.agents/skills` is absent in this revision; repository AGENTS/CLAUDE/security/engineering/production instructions were consulted. No production deployment, D1 migration/write, attack traffic, secret rotation, branch protection or account permission change was performed.

Actual deployment: successful push CI on current main triggers `.github/workflows/deploy-cloudflare.yml`, which builds vinext via Vite/Cloudflare and uploads `dist/server/index.js` plus `dist/client`. `worker/index.ts` imports `vinext/server/app-router-entry`; vinext's generated RSC entry imports `decodeReply` from `@vitejs/plugin-rsc/rsc`. Therefore npm's dev dependency label does not establish exclusion from the deployed Worker.

## Findings and fixes

1. **High: RSC server denial of service.** Direct React Server DOM 19.2.6 falls in GHSA-wx67-qw84-cm4g (<19.2.8). Upgrade React, React DOM and react-server-dom-webpack together to 19.2.8 to satisfy peer requirements. Reference: https://github.com/advisories/GHSA-wx67-qw84-cm4g . Exploitability against the live site's specific action routes was not tested.
2. **Hidden RSC copy.** Plugin RSC 0.5.26 contains vendor/react-server-dom 19.2.6. Its framework package crawl and alias hook select the installed direct package in this project. A new build gate inspects the actual RSC graph, including vendored paths, rejects vulnerable versions and rejects missing evidence. Candidate builds verified 2 modules in the analysis phase and 4 in the final server phase. Built server/SSR JavaScript contains 19.2.8. The vendor copy still exists on disk, but was not selected by the checked server build. A regression test rejects the vendor copy even when the direct dependency is patched.
3. **Incomplete release audit.** The old audit used --omit=dev and exited zero after registry outages. The new bounded Node gate includes dev/build/runtime dependencies, validates JSON/counts/exit status, blocks high/critical findings and fails closed on timeouts/outages. CI and manual deployment both run it. The old shell entry remains a compatibility wrapper.
4. **Other high dependency paths.** Same-major updates: Cloudflare Vite plugin 1.37.1 → 1.66.0, Vite 8.0.13 → 8.3.5; compatible transitive patches refreshed without --force. Scoped vinext image-size override 2.0.2 → 2.0.4 avoids a vinext major upgrade. Vite's reported launch-editor/dev-server issues affect local tooling; Cloudflare's miniflare/sharp/undici/ws paths affect build/dev/deployment tooling. image-size processes build-time image metadata in inspected vinext paths. These are separate from proof of live remote exploitability.
5. **Cloudflare compatibility.** The current official Cloudflare toolchain uses Miniflare 5 beta. Existing D1/Cache integration fixtures use the official convertV4MiniflareOptions converter; assertions and application logic are preserved. This prerelease transitive runtime remains a maintenance/compatibility consideration despite the passing local checks.

Complete audit at this session: before 38 (15 high, 23 moderate), after 23 (0 high/critical, 23 moderate). The earlier independent 56-count report was not reproduced; registry metadata/resolution can differ over time. Counts are package-level npm findings, not 38/23 distinct exploitable vulnerabilities. Machine-readable remaining paths and advisory URLs are in SECURITY_AUDIT_2026-11-01.json.

## Remaining risk

- Moderate findings remain in lint/minimatch, drizzle-kit's old esbuild dev-server chain, and vinext/@vercel/og/Satori. Do not force npm's suggested old major downgrades or vinext 1.x without separate compatibility work. No application ImageResponse import was found in the inspected source; that does not establish that all Satori paths are unreachable.
- HSTS absence and missing main protection were reported by the independent initial inspection. They remain unchanged; branch protection/permissions/secret rotation require separate owner confirmation. CSP still uses existing unsafe-inline allowances; no policy was changed in this task.
- No assertion of complete security or live remediation: changes must be reviewed, merged and deployed before affecting koretaildata.com. Private-site review is outside this repository subtask.

## Validation

- npm ci --ignore-scripts: passed with candidate lock; Linux x64 native optional packages are present in the lock.
- Full dependency audit and new real registry gate: passed at high threshold, 23 moderate remaining.
- TypeScript: passed. ESLint: passed with 24 existing warnings; changed files passed (build plugin additionally checked with --no-ignore).
- Secret scan: passed over working tree and all reachable Git history, values suppressed.
- vinext/Vite build: passed; actual RSC graph and final server version verified as above. Build-generated public UI assets restored, excluded from patch.
- New audit/RSC gate tests: 3 passed; existing security tests: 11 passed (13 including audit tests at that run).
- Rendered HTML: 53/53 passed with build-matching origin. Initial failures caused by Windows CRLF and mismatched expected origin were resolved by local LF normalization/environment alignment, not application edits.
- Official-converter Workerd/D1/Cache/secret-scan integration rerun: 52/52 passed.
- Full unit suite: 2,635/2,635 passed (Node 24.17.0 on Windows; CI uses Node 22.13.1/Linux and remains required). An earlier run found the old Miniflare API mismatch and sandbox temporary-directory permissions; both were addressed and independently rerun.
- Critical browser suite: 5/5 passed against local Wrangler/Workerd. Windows vinext start returned 404 for built static assets; tests use local Wrangler/Workerd with the same built assets instead. No production request was used for these tests.
- Operational health: exited zero with UNKNOWN_NO_DATABASE/runtime enablement unknown, as expected without production credentials. This is not a live health pass.

## Exact publication path and release constraint

Publish only this isolated branch and a draft PR. Review candidate CI at the exact head SHA. Do not merge while checks are failed/pending, or while the separate release is in progress. Refresh origin/main and reconcile any new commits, rerun affected checks, then use the owner's established reviewed PR merge process. A main merge automatically starts CI and, on successful push CI, Deploy Cloudflare production (including the workflow's existing D1 migration steps). Consequently **merging is a production release action**, and is intentionally not performed by this task. After an approved release, verify the deployed revision via /api/build, signed-out locale/API health, headers and smoke tests, while preserving last-good data. No deployment command or workflow_dispatch was run here.
