# KORETAIL dependency security review — 2026-11-01

## Scope and deployment boundary

Baseline/latest fetched main: `e96a5017e3b89b59900d75a120982f198facb501`. Work performed in an independent clone on `fix/security-rsc-audit-20261101`. `.agents/skills` is absent in this revision; repository AGENTS/CLAUDE/security/engineering/production instructions were consulted. The initial review performed no production deployment, D1 migration/write, attack traffic, secret rotation, branch protection or account permission change. The owner subsequently explicitly approved merging and deploying PR #546; the approved release continuation is recorded below and in the PR.

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

## Approved release continuation

The owner explicitly approved merging and deploying PR #546 after its initial complete CI success. Design PR #545 subsequently merged as main `81523313405089360142c5ae751facbd989c7859`; its 16 changed files were reviewed and integrated into this security branch without conflicts. No security dependency/configuration file overlaps that design change. Typecheck and the current-day/RSC/audit focused tests (11/11) passed after integration.

The integrated head must pass its own complete CI before merging. Refresh main again immediately before merge; if it moves, integrate and recheck rather than deploying an outdated candidate. Merge only the reviewed head without bypassing checks. A main merge automatically starts push CI and, after success, Deploy Cloudflare production, including the existing migration/recovery preflight. Observe any ongoing design deployment and the production concurrency queue; do not start duplicate deployment dispatches.

Record the exact integrated head, CI run, main merge SHA, deployment run and public verification outcome in PR #546. After the approved release, compare /api/build with the deployed SHA, verify ordinary signed-out locale pages and read APIs, inspect the production build's RSC graph evidence and pinned package versions, and check operational health without exposing secret values. Branch protection, secret rotation and account security permissions remain outside this release approval. Remaining moderate findings retain the boundaries documented above.
