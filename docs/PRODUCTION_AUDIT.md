# Production Audit — 2026-08-25

Status values are evidence-based. `BLOCKED` means an external account, domain, key, deployment, or local infrastructure condition prevents a valid pass. It does not mean the item was silently accepted.

| # | Gate | Status | Evidence / blocker |
|---:|---|---|---|
| 1 | Git clean / HEAD confirmation | PASS | Started from fetched `94cabdd6a1ef0becca0cc8d61b43b337c5b8e0ad`; safety tag `rpk-work-v6.1-final` was retained and the verified production tree was merged to GitHub `main`. Final commit is recorded in the release report. |
| 2 | Secret scan | PASS | Working tree and reachable Git history scanner found no high-confidence credentials. |
| 3 | Work runtime decoupling | PASS | Independent config, origin validation and public routes do not use ChatGPT authenticated-user headers; `.openai` remains only for the separate Work checkpoint. |
| 4 | Production build | PASS | `NEXT_PUBLIC_SITE_ORIGIN=https://rpk-ci.invalid npm run build`. |
| 5 | Lint | PASS | ESLint completed without errors. |
| 6 | Typecheck | PASS | `tsc --noEmit` completed without errors. |
| 7 | Unit tests | PASS | 13/13, including leakage, target matching, source errors, D1 migrations, immutable predictions and idempotent collector writes. |
| 8 | Browser E2E | PASS | GitHub Actions CI run `32749205707` passed the 14-case Chromium suite, including project-local font loading. |
| 9 | Mobile overflow | PASS | Chromium verified 320/375/390/430px Airport pages without page-level horizontal overflow. |
| 10 | KO | PASS | Server-rendered locale, hydration, navigation and Pretendard loading passed. |
| 11 | EN | PASS | Server-rendered locale and hydration passed. |
| 12 | ZH | PASS | Server-rendered `zh-CN`, long-copy containment and Noto Sans SC loading passed. |
| 13 | JA | PASS | Server-rendered `ja`, long-copy containment and Noto Sans JP loading passed. |
| 14 | Server `html lang` | PASS | Direct server responses: `ko`, `en`, `zh-CN`, `ja`. |
| 15 | Anonymous access | PASS | The current Sites deployment access policy is `public`; independent Cloudflare `.com` deployment remains separate and blocked. |
| 16 | HTTPS | PASS | The public Sites deployment is served over HTTPS; the user-owned `.com` certificate remains blocked with domain connection. |
| 17 | Custom domain | BLOCKED | User-owned `.com` has not been supplied/connected. |
| 18 | Canonical | PASS | Generated solely from validated `NEXT_PUBLIC_SITE_ORIGIN`; production build rejects chatgpt.site/localhost. Final `.com` curl remains blocked by domain. |
| 19 | Hreflang | PASS | Four locales plus x-default are generated from the configured production origin. Final `.com` curl remains blocked by domain. |
| 20 | Sitemap / robots | PASS | Dynamic origin-based routes replace hard-coded public files; `/api/` is disallowed. Final `.com` curl remains blocked by domain. |
| 21 | Security headers | PASS | CSP, frame protection, nosniff, referrer and permissions policies are configured and unit-tested. |
| 22 | Production dependency audit | PASS | `npm audit --omit=dev`: 0. Dev-tool findings are documented separately. |
| 23 | D1 migration | PASS | Both migrations applied to local SQLite; 13 tables and immutable UPDATE/DELETE triggers verified. Production D1 creation is still blocked by account access. |
| 24 | API failure / degraded mode | PASS | Missing DB/keys return safe degraded or NEEDS_KEY states; bounded fetch errors and redaction are tested. Full live HTTP matrix requires staging. |
| 25 | Source truth / timestamp | PASS | Canonical event/published/retrieved fields exist; Incheon compact KST timestamps and official lowercase gate fields are normalized. Actual source calls remain blocked by key. |
| 26 | Demo vs Live truth | PASS | Current visitor-facing current/forecast views remain Demo; no source is claimed LIVE before contract checks. |
| 27 | Immutable prediction archive | PASS | Schema, insert-only triggers and automated mutation rejection test exist. Scheduler is not active. |
| 28 | Outcome archive | PASS | Separate outcome schema and target-match contract exist. Collector is not active. |
| 29 | Baseline scoreboard | PASS | Same-weekday, four-week-average and seasonal-naive calculations exist and are tested; UI correctly remains COLLECTING. |
| 30 | Public production smoke test | BLOCKED | Requires Cloudflare connection, workers.dev deployment and then the user-owned `.com`. |

## Current measured test totals

- Unit/contract/migration/collector: 13/13 PASS.
- Rendered product assertions: 16/16 PASS.
- Production dependency audit: 0 vulnerabilities.
- Browser suite: 14/14 PASS in GitHub Actions CI run `32749205707` using Chromium.

The exact release commit SHA belongs in the release report and GitHub deployment record; the document intentionally avoids a self-referential SHA that would change with every documentation commit.
