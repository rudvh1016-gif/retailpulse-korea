# KORETAIL — bounded Shilla contract diagnosis (review required)

Current reviewed baseline: `6fd5e2e51b41090352d3e520acc41b4dc9102c77` (GitHub main API).
The Git transport mirror still returned `6a50284`; the isolated branch was
rebased onto the independently verified `6fd5e2e` object, not the stale mirror ref.
Prepared locally at the owner's urgent FX-recovery request; **not executed or
published by the preparing agent**. A previous natural collector request failed
`SELECTOR_UNVERIFIED`, but the received HTML was not retained. Local ordinary
HTTP and cloud browser attempts timed out, so the runner's current public
selector contract remains unverified. This change does not restore collection
or establish a provider quota, and must not be described as either.

## Opt-in only, existing manual workflow

`diagnose-provider-reachability.yml` retains its existing default data.go.kr
runner matrix and script unchanged. New `scope: shilla_exchange_contract`
skips that matrix entirely and runs exactly one standard Ubuntu job. Existing
manual callers omitting `scope` retain the old behavior. All three existing
manual jobs explicitly require `workflow_dispatch`, so the one-shot PR path
cannot also run them. There is no new schedule, production workflow dispatch,
collector invocation, DB import,
DB access, production environment, paid service or secret. Repository token
permissions remain `contents: read`; Shilla checkout does not persist it.

The script accepts no URL or credential inputs. CLI execution requires the
literal `--once`; importing it for tests performs no network call. Root must
review the exact commit before publication opens the single diagnostic PR.
Do not substitute rerun tools or an unrelated production workflow. The
preparing agent has made **zero new source requests** for this local change.

## Reviewed one-shot PR proposal (not published/executed here)

Because no supported manual dispatch tool was available, root approved preparing
an ordinary repository CI path after the natural post-deploy attempt failed
again at `2026-10-21T02:10:27Z`: run `39531472863`, job `118998121567`,
`BLOCKED`, `providerRequests: 1`, `changedRows: 0`, `SELECTOR_UNVERIFIED`.
That is not fresh-rate recovery. No additional provider request was made by the
preparing agent and the durable source guard was not changed.

The existing workflow additionally accepts `pull_request` **opened only**,
base `main`. Its separate `shilla_exchange_contract_once` job requires all of:

- event `pull_request`, action `opened`, `run_attempt == '1'`;
- repository AND PR head repository exactly `rudvh1016-gif/retailpulse-korea`;
- head branch exactly `diagnostic/shilla-exchange-contract-20261021`;
- PR base exactly `main`.

It checks out the explicit PR head SHA without persisted credentials, then
checks the unchanged reviewed script's SHA-256 before executing it once:
`e40c42c3f4f466518a7506728cf05c2ba98dd11f3f907e55e14d0e378ebd6fb8`.
It has only `contents: read`, no production environment or secrets, and one
standard Ubuntu runner. No synchronize/reopened/push/schedule trigger exists;
GitHub reruns have a later run attempt and therefore cannot issue another call.
This is not `pull_request_target`. Unrelated/fork PR jobs are skipped. Opening
a new PR with the exact same branch later would constitute another execution
and is not authorized by this single-run review. Remove/close the temporary
incident path after evidence is collected; do not turn it into a scheduler.
Publication/PR opening remains subject to root's final review and approval.

## Single-request and redaction contract

- One GET of `https://www.shilladfs.com/estore/kr/ko/`, normal `Accept: text/html`,
  no spoofed identity, cookies, authentication, redirects or retries.
- One total 12-second budget covers response headers and streaming body.
- Strict 1 MiB accepted-body limit, checked against declared length and every
  streamed chunk. Oversized chunks are discarded and the stream is cancelled;
  no accumulated body above the cap is retained. No second request follows.
- Non-200 (including 403, 429 and redirects), unsupported MIME/encoding,
  detected security/login/CAPTCHA, malformed/overcomplex content, oversized
  responses and timeout all stop. No CAPTCHA solving, alternate URL, proxy,
  browser fetch, authentication or other recovery path exists.
- Output is one JSON object only: HTTP status, allowlisted MIME enum, accepted
  body byte count, SHA-256 of the complete body (null if incomplete), and at
  most 12 sanitized public exchange-evidence elements. A missing/blocked result
  exits nonzero without raw errors. A hash is not evidence of a valid rate.
- Only literal presentation tag/class/label allowlists, USD1 numeric rates
  (100–10000 KRW, two decimal output) and valid explicit source dates are
  emitted. Mixed account/URL/arbitrary text is rejected. Scripts, forms,
  inputs, comments and unknown classes/attributes cannot supply output.
- Raw HTML, scripts, request/response headers, cookies, session values, URLs
  with queries and raw errors are never logged, saved or uploaded. There are
  no artifact steps. Unknown selectors may intentionally yield no evidence;
  safety takes precedence over broad DOM capture.
- A date is never inferred from the runner clock. Sanitized output is diagnostic
  evidence only, not a canonical observation and not a collector parser change.

This isolated diagnostic does not release the collector's existing 24-hour
selector/security guard or alter its source-request cadence. No claim is made
that repeated executions are within an official provider quota. Approval here
is for local preparation; live execution/publication remains with root.

## Focused offline verification

`node --test tests/shilla-contract-diagnostic.test.mjs`: 12 tests cover the
public widget and changed selector, sanitization, explicit/missing/invalid
dates, login/security/403/429/redirect stopping, MIME/encoding rejection,
exact 1 MiB and streamed/declared overflow, network error redaction, one total
deadline, one fetch per fixture, workflow isolation and exact PR/attempt/branch/repository/SHA guards. All fetches are
injected in-memory fixtures; no live URL is contacted by these tests.

Additional focused ESLint, syntax, whitespace, scheduler-truth and working-tree
secret-pattern checks are recorded in the handoff. No full build, full-history
secret scan, live source verification or dispatch has been performed here.
