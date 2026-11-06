# A1 publication verification evidence

Base main: `f7ec6548a3dd3640ddccbaa4ae0563ad1bcc5e18` (PR #590).
Independent branch: `codex/a1-public-verification-evidence-20261106`.
No edits to the four airport test files from PR #589.

## Why this is necessary

The existing A1 fallback in run [42244809365](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/42244809365/job/127984449361)
collected successfully: 117 requests, 547 tracked-today physical flights, 937 changed
rows, 3126 storage writes. It then returned HUMAN_REVIEW_RECOVERY_UNVERIFIED.
The exact A1 scorecard group changed by one completed attempt/117 requests and one
publication mismatch, without an additional data/storage failure or null check.
Public totals later showed 547, but that cannot reconstruct the first mismatching
response. A later response had Age 232/UPDATING under the existing 60s fresh/300s
stale cache policy. Cache visibility is a hypothesis, not a confirmed cause.

## Behavior and truth boundaries

The existing verifier still performs the same bounded measurement and at most ONE
GET of the same current-day public summary. There is no retry, sleep, query cache
buster, new header, purge or TTL change. Its exact date/mode/total/retrieval-time/
terminal-key-and-count/scope/cap checks are unchanged. The expected A1 projection
is extracted once as a shared helper for the existing matcher and diagnostics,
so a second independently drifting definition is not introduced.

Automatic verification now emits a bounded JSON `airportRecoveryVerification`
record containing target/check time, three separate verdicts, expected and actual
projection fields, mismatch checks, unmeasured checks, nonapplicable terminals,
collector start/finish and source-health retrieval times, response generation time,
HTTP status and selected cache evidence. All values
remain observational; only the original matcher decides `publicValid`.
Wrong-day/degraded/unusable bodies do not become counts for the current day.
Missing, null, real zero and invalid/redacted values remain distinct. Date/time
strings retain their original text; equivalent-looking timestamps are not made
equal by formatting. Generated-at/cache metadata is diagnostic only, not a new
pass criterion. Existing public-read exceptions still propagate unchanged.

No flight rows, passenger records, free-form database details, arbitrary response
strings/keys, URLs, cookies, authorization headers or error text are printed.
Cache evidence is a decoded allowlist (Age, known CF status, known directives,
server Date), not a dump of headers. Diagnostic logger failure cannot alter a
collector/verification result. No incident, attempt, budget or last-good record
is changed by diagnostics. A later good inspection does NOT retroactively award
the old attempt a recovery success.

## Manual read-only path

Use existing **Operational Memory Inspection**, mode `inspect_a1`, on a reviewed
revision. It dispatches `scripts/inspect-airport-recovery.ts` instead of the
bookkeeping command and skips the broad central-health follow-up. Default modes
remain unchanged. No new job schedule, environment, permission or secret.

This mode reads at most ten current-day controlled A1 ledger rows (fixed source,
logical job and date, SELECT only), a sample capped at 2000 flight rows plus the
existing bounded run/health/coverage SELECTs, and at most one public summary. It
prints ledger data/storage/public bits and observed request counts alongside a
CURRENT verification. Attempt identifiers are hashed; free-form evidence is not
read. It calls no provider, admits no work, releases no lock, writes no ledger,
and never invokes a collector. The usage report measures direct diagnostic SQL;
public-summary backend read cost is not included. Missing query metadata is
labelled unverified, not official account usage or zero consumption. No capacity
or cost-saving claim is made.

Run locally only when the existing production database credentials are already
available (do not paste them in chat):
`npx --no-install tsx scripts/inspect-airport-recovery.ts`.

## Validation and limits

Focused tests cover each compared field, retained false/unknown results, wrong
date, cap, invalid data, null/degraded body, one unchanged GET, no SQL writes,
HTTP/transport failure propagation, metadata capture, redaction, logger failure
and manual workflow separation. The existing real collector/verifier contract
suite must remain green; CI performs the normal full release gates.

Current evidence cannot establish what an unrecorded historic response contained.
Inspecting after cache refresh may match even if the earlier response did not.
Do not reset the spent daily attempt, repeat A1 requests, credit a different
source's success, weaken equality checks or change cache policy to turn that
history green. Use the new field-specific evidence before proposing any further
functional recovery change. Actual commits/CI/manual-run/release evidence and
the remaining root-cause boundary are recorded in the PR.
