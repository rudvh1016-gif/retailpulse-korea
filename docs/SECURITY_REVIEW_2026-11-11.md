# React Server Components security patch — 2026-11-11

## Scope and evidence

Baseline fetched main: `aed2c8ebc48af7395e3108852d683bf81e038dd4`.
The read-only public `https://koretaildata.com/api/build` response matched that
SHA with `dirty: false` during this review. PR #597's unchanged dependency tree
failed its release audit; that UI PR remains separate from this patch.

Official React advisory [GHSA-xqc2-xf4c-x3h3](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3)
(CVE-2026-126187, critical, CVSS 9.5) includes React Server DOM 19.2.8.
The upstream fix on the existing minor line is 19.2.9. The advisory describes
RSC remote-code execution under a rare response condition involving multiple
typed arrays and an attacker-controlled value. This review did not send attack
payloads or establish that the live application satisfies that condition. The
dependency alert alone does not establish compromise; no incident investigation
was performed.

This project is not a client-only React app: `worker/index.ts` delegates to
`vinext/server/app-router-entry`, and `vite.config.ts` builds a Cloudflare RSC
Worker. `@vitejs/plugin-rsc` resolves the direct React Server DOM package, which
is labelled a dev dependency but compiled into the runtime. No application
`use server` directive or typed-array use was found in `app/`; this narrow
source check does not prove the framework's server processing unreachable.

## Minimal change

- Pin React, React DOM and react-server-dom-webpack together at 19.2.9, preserving
  peer compatibility. No framework minor/major upgrade or unrelated lock refresh.
- Raise the actual RSC module-graph gate from 19.2.8 to 19.2.9. It still rejects
  absent graph evidence, vulnerable vendor copies and unreviewed minor releases.
- Add regression coverage for direct and vendored 19.2.8 and the compatibility
  boundary. The new direct/vendor cases failed against the old gate, then passed
  after the minimum changed.

The plugin's bundled fallback remains 19.2.6 on disk. It must never be selected:
the build gate checks selected module paths rather than assuming npm's package
listing covers vendored code. Candidate builds checked 2 RSC modules in the
analysis phase and 4 in the final server phase. Built server and SSR JavaScript
contained 19.2.9; searches found no 19.2.8 or 19.2.6 in that server output.

## Remaining findings and release boundary

The complete registry audit including dev/build/runtime dependencies reported
14 moderate, 0 high and 0 critical findings after this patch. Counts are
package-level, time-dependent registry findings, not proof of complete security.
Remaining paths are lint/minimatch, drizzle-kit's legacy esbuild tooling, and
vinext/@vercel/og/Satori. The latter cannot be dismissed only because it is a
dev dependency. No forced downgrade or framework major upgrade was included.

No production deployment, merge, D1 write/migration, credential change, security
setting change or protection bypass was performed. Full CI for the published
patch commit is required. Merging current main can trigger production deployment;
that release requires the existing authorization and all normal gates. Once
released, verify `/api/build` matches the deployed revision and check ordinary
signed-out pages and APIs. PR #597 must then incorporate the patch and rerun its
own CI, including its previously blocked browser scenarios.

## Validation

- Clean `npm ci --ignore-scripts` with the final lockfile passed. npm's unrelated
  platform-metadata churn was excluded; all unrelated package entries are unchanged.
- Full lint passed with 25 existing warnings and no errors. Changed TypeScript
  files also passed explicit lint, including the normally ignored build directory.
- Full typecheck passed.
- `npm test` passed: production build, 2,876 unit tests and 54 rendered-HTML tests.
  The build used the CI-shaped local origin and staging settings, not production secrets.
- RSC security regression tests passed 6/6, including the two new cases that failed
  before the gate change. Independent read-only review found no blocking issue.
- Full dependency audit passed its existing high/critical threshold with 14 moderate
  findings remaining. No threshold or registry failure handling was weakened.
- `npm run health` was blocked by the tsx CLI's sandbox IPC `EPERM`; running the same
  health script with `node --experimental-sqlite --import tsx scripts/health.ts`
  succeeded. Its system verdict remains UNKNOWN without production credentials/DB.
- Local Chromium launch failed with `socket() failed: Operation not permitted`;
  browser regression execution is pending remote CI.
- Full working-tree/reachable-history secret scan passed.
- Remote PR CI must verify the exact published commit, including the full browser
  suite. No merge/deploy performed.
