# Monthly official-calendar check

Owner request (2026-10-21): public holidays do not need daily provider checks; retain published multi-year calendars and check for changes monthly. This correction is separate from the UI hotfix and manual CN/VN/TH evidence review.

## Implementation

- Keep the one existing `collect-production.yml` daily trigger and job. Each existing run reads the two stored D1 receipts to decide eligibility; this **daily stored-metadata check is not a daily official-source fetch**. Dependency setup still follows the existing workflow.
- Use `last_verified_at`, not the last attempt, to suppress successful source fetches for the rest of the **KST calendar month**. A missed/delayed month-start run catches up on the next existing daily run, including after day 1. There is no day-one-only gate.
- Failed or review-required sources wait **seven full days after `checked_at`** before another attempt. There is no in-run retry. Persistent failure therefore makes at most **five requests per source in any 31-day calendar month**; normal success makes one. A success after recovery suppresses further calls that month. Future stored timestamps fail closed. No new cron, schema, manual dispatch or credential was added.
- JP/US remain the only automatically published structured sources. The existing currently published previous/current/next-year selection stays bounded; this is already multi-year storage, not a one-day calendar. KST January 1 now uses the new current year even while UTC is December 31.
- Preserve changed-only semantic payload writes, two bounded current rows, exact URLs, 15-second/1MiB caps, redirects rejected, failure-preserved verification time, restricted US federal-employee scope and no AI calls.
- Change validity from 14 days to **45 days**, justified as the maximum 31-day monthly gap plus the existing 14-day failure grace. Otherwise a correctly monthly-checked calendar would become stale halfway through each month. A failed monthly check never renews verification and last-good events still expire after that bound. An old superseded static date cannot return after expiry.
- Public metadata now says `cadence: MONTHLY`, `cadenceHours: null`, `eligibilityCheck: DAILY_STORED_METADATA`, `retryCooldownDays: 7`, `timeZone: Asia/Seoul`, `staleAfterDays: 45`. No fixed-hour interval misrepresents variable calendar months. UI labels monthly confirmation explicitly.

## Unchanged / limits

Customs RSS/allowance jobs, Japanese numeric customs updates, all other daily production sources, credentials, database schema, cron expressions, provider access approvals and source count are unchanged. New CN/VN/TH/KR manual multi-year evidence is a separate data change, not automatic source activation.

New official annual calendars and later changes are picked up on the next eligible monthly check **only for the existing JP/US adapters**. This is not event-driven or real-time notice monitoring. Failed-source recovery still depends on a later existing daily workflow arriving, cooldown expiry and source recovery. Runtime enablement remains GitHub state, unproven from this checkout. A source successfully verified in October ordinarily next becomes due on **2026-11-01 KST**, but a recent failed attempt can delay it until its seven-day cooldown ends. No workflow was manually invoked.

## Validation

- 36/36 focused tests passed, covering monthly KST boundary, delayed-run catch-up, seven-day recovery, monthly request bound, successful-month suppression, validity, canonical current-year rollover, parser/failure preservation and scheduler truth.
- Scoped ESLint passed; `git diff --check` passed.
- Full repository typecheck passed (`NODE_OPTIONS=--max-old-space-size=2048 npm run typecheck`). Full build/browser and production execution were not run in this isolated task. Deployment and an actual scheduled monthly run remain external release evidence, not assumed from unit tests.
