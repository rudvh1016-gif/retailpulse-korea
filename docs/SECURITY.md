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

Pull-request CI has read-only repository permission and receives no production secret. Cloudflare deployment is manual, main-only and protected by a GitHub production environment. Do not use `pull_request_target` for untrusted code.

## Known residual risk

As of 2026-08-26, `npm audit --omit=dev` reports zero vulnerabilities after Playwright was upgraded from 1.55.0 to 1.62.1. The full development-tool audit still reports 18 findings (7 moderate, 11 high), mainly in the vinext/Vite/Wrangler build chain. They are not shipped as visitor runtime dependencies, but they remain a supply-chain and CI maintenance risk. A dry-run did not identify a safe, complete non-breaking fix. Do not run forced major upgrades solely to make the count disappear; review compatible upstream patches. Production dependency vulnerabilities at high severity block release.
