# Security

## Public repository rules

Secrets are prohibited in source, documentation, fixtures, frontend bundles, URLs and logs. CI scans high-confidence credential patterns. Actual keys belong only in Cloudflare Secrets or protected GitHub Environment Secrets. Collection uses a dedicated `CLOUDFLARE_D1_WRITE_TOKEN`; do not reuse a Global API Key or expose it to the frontend. If a real key is ever committed, revoke/rotate it first; deleting the current file is not enough because Git history remains public.

## Runtime controls

- HTTPS-only production origin.
- CSP, clickjacking, MIME sniffing, referrer and permissions headers.
- Server-side upstream calls with bounded timeout/retry.
- Service-key query values redacted before logging.
- Public API errors never return raw stacks or credentials.
- Source failures degrade independently; historical and Demo-labelled surfaces remain available.
- Beta signup disabled by default.

## CI permissions

Pull-request CI has read-only repository permission and receives no production secret. Cloudflare production deployment follows successful push CI on current main, and remains protected by the GitHub production environment. PR and fork workflow runs cannot trigger deployment. Checkout is pinned to the successful CI revision, and stale revisions are rejected. Manual main-only staging/production deployment remains available. Do not use `pull_request_target` for untrusted code.

## Dependency release gate (2026-11-01)

`node scripts/audit-dependencies.mjs` audits the complete locked dependency tree, including dev dependencies. In vinext/RSC, a dev dependency can be compiled into the deployed Cloudflare Worker; `npm audit --omit=dev` is not sufficient evidence. High/critical findings block CI and manual deployment. Missing, invalid, timed-out or inconsistent registry reports also block release (exit 2); they are not proof of safety. Moderate findings are reported and require continued review.

The RSC build gate in `build/rsc-security-plugin.ts` checks the actual server module graph, including plugin-vendored React Server DOM. It rejects unpatched versions, even if the direct dependency is patched. The current compatibility-verified line is 19.2.8 or later within 19.2.x; future minor/major upgrades need deliberate review.

On the isolated 2026-11-01 candidate, the complete audit changed from 38 findings (15 high, 23 moderate) to 23 moderate / 0 high / 0 critical. This differs from the earlier independently reported 56 findings; registry metadata and tree resolution are time-dependent. Remaining moderate paths include lint glob parsing, drizzle-kit's legacy esbuild development server, and vinext's Satori SVG generation chain. Do not describe them as harmless solely because npm labels them dev dependencies. See `docs/SECURITY_REVIEW_2026-11-01.md` for evidence, limits and release steps.