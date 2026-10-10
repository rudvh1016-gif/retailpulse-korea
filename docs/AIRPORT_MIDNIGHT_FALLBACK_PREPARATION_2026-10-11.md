# A1 midnight fallback preparation — execution blocked

This change prepares the missing-first-run recovery that PR331's publication
rechecks cannot start on their own. It is stacked on PR331, commit
`3812a0102e15df52b1b9b7757ea8da0d18ca0ae9`; PR330 and PR331 are unchanged.
The reviewed production main remains
`70ec17577c7ff9fb4b4beffae21c647a9e05532e`.

## What is prepared

The existing 15-minute coverage witness calls a guarded A1-only adapter. No new
cron, Worker route, provider, secret, permission grant or database schema is added.
The witness still reports missing coverage after 01:15 KST and does not convert
held schedules into today's observations or erase the original failed run.

When separately enabled, the adapter considers a missing early run only between
01:15 and 03:00 KST. It checks the early workflow's bounded history and all five
active GitHub status lists, including older active daily runs. Truncated,
unreadable or contradictory evidence fails closed. An early run that already
started, even if it failed, remains with its original retry ladder.

`OperationalMemory.admit` atomically narrows the existing MISSED_RUN ceiling to
one controlled attempt per A1 logical job/KST day. A persistent source/day/00:07/
operation identity and existing in-flight lock survive process restarts.
The adapter rechecks coverage, originals, source protection and remaining budget
after admission. If this process proves it never attempted dispatch, it closes
the aborted attempt while still consuming today's one-attempt budget; an unused
admission cannot permanently block tomorrow. Crash or uncertain dispatch evidence
holds the lock for human review. Elapsed time never releases a lock or causes a
second dispatch.

Dispatch is one call to the allowlisted early workflow on main, with an A1-only
input and a fixed KST target date. Both existing retry jobs retain that date and
exclude enrichment for this fallback. The collector rechecks today's completed
scan and auth/429/schema protection when it actually starts. A queued fallback
cannot collect a different day. Late native early and fallback workflows share
`production-collector`; the second successful same-day early scan skips at zero
provider cost. The daily 06:07 refresh remains intentionally separate.

The read-only budget preflight and atomic reservation share the same SQL
expression, including legacy calls. Job ceiling 125 and conservative rolling
24h+30m shared ceiling 500 are unchanged. The collector reservation is
authoritative; a preflight cannot reserve or increase quota.

Dispatch acceptance is RECOVERY_PENDING, never RECOVERED. A receipt stores the
correlated run id in the existing incident event table. The lock finishes only
after that exact workflow run is terminal and today's complete storage witness
and public projection are verified. Timeout, 403, 429, uncorrelated responses,
receipt persistence failure and mismatched runs preserve the lock and require
human review. No automatic dispatch retry is added.

## Current execution blockers — not changed by this PR

- `CENTRAL_RECOVERY_EXECUTION_ENABLED=false`; the existing compiled/owner/runtime
  approval gate is enforced before admission or network calls.
- `A1_MIDNIGHT_RECOVERY_REVIEWED=false`. The generic registry still classifies
  A1 as HUMAN_REVIEW_ONLY. Preparation is not source activation.
- `A1_RECOVERY_DISPATCH_PERMISSION_GRANTED=false`. The witness workflow retains
  `contents:read`; its automatic GITHUB_TOKEN is not evidence of `actions:write`.
  GitHub Actions has no existing dispatch-token secret to reuse. The Worker-only
  dispatch token is not copied or exposed.

Actual activation would need a separately reviewed **witness-job-only**
`actions:write` grant, the corresponding capability confirmation, A1 source
review and existing central owner/runtime/compiled approval conditions.
This task prohibits permission expansion, so none is made and no new credentials
are requested. Production code never supplies the activation test seam.
No A5/weather source is activated through this prepared A1 path.

Merging this preparation alone does not recover a missing first A1 run. PR331
still handles publication waits only once its first workflow starts. Neither PR
has been merged or deployed by this agent. Absolute availability is not claimed:
provider publication and GitHub event delivery remain external dependencies.

## Verification and operational boundary

Tests use actual migrated local SQLite plus fake GitHub/provider adapters. They
cover closed gate/no permission with zero reads/writes/dispatch, concurrent
admission, persistent receipt and restart, native arrival after admission,
current-day completion, exhausted quota, 429/auth/schema failures, uncertain
dispatch, queued date mismatch, and acceptance/storage/public verification.
Existing central-gate, operational-memory, scheduler truth and runner tests run
unchanged. Owner UI Lock and its approval fixtures remain in force.

Local targeted tests: 157 pass / 0 fail / 0 skipped. Typecheck, targeted lint and
secret scan are recorded in the PR with exact results. Native Node build and
normal CI results must be distinguished; no local check is a deployment.

No manual production dispatch, remote database write/migration, permission or
security setting change, paid service, deletion, merge or deployment is performed.
The earlier diagnostic Issue was not created; its rejected publication is not
retried or moved to another publication route. This document records only the
requested implementation and review boundaries.

GitHub contracts: [schedule delivery](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[active run status/public read API](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository),
[dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
