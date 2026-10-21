# KORETAIL — Shilla current-label parser repair

Baseline: GitHub main `0fc5e2f04a037936485026eff463ae2a967f8be3` (#416).
Scope: local parser/fixture repair only. No provider call, guard reset, production
DB write, schedule, credential, UI change or raw-page artifact is added here.
Diagnostic PR #418 is separate and must not be merged or deployed.

## Actual evidence, not a fabricated production rate

The natural post-deploy collector [run 39531472863 / job 118998121567](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39531472863/job/118998121567)
at 2026-10-21 02:10:27 UTC failed `SELECTOR_UNVERIFIED`, providerRequests=1,
changedRows=0. This is distinct from the preceding zero-request cooldown skip.
Under that exact code, the failure follows HTTP200, accepted MIME and decoded
HTML; it does not establish which page content the collector received.

The separately reviewed, authorized [one-shot diagnostic #418](https://github.com/rudvh1016-gif/retailpulse-korea/pull/418)
[run 39532512675 / job 119001488797](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39532512675/job/119001488797)
at 02:21:09 UTC made one GET and returned HTTP200 text/html, 208566 bytes,
SHA256 `7c3a84074b8ecae2a9abb10af8076ae5588a223e4d5d151d274fc8487a6628f7`.
Its sanitized evidence was `<a>`, permitted classes [], label `오늘의 환율`,
USD1 rate `1332.10`, explicit dates []. No legacy `.exchange`/`.sum` evidence
was emitted. Unknown classes were intentionally suppressed; this is not a
complete DOM census. No raw page or arbitrary attributes were retained.

The diagnostic value is evidence only. It is not embedded in production code,
inserted into D1, assigned a new verification timestamp, or used as a fallback.
Fixtures reconstruct the observed semantic contract, not raw HTML or unknown
DOM details. Real collection with the new parser remains unverified.

## Narrow parser contract

- Retain the legacy `.exchange .sum` selector and its explicit-date rules.
- Add only closed `<a>` text outside those legacy widgets: the literal
  `오늘의 환율` plus exactly one complete USD1 equation and KRW unit. Label and
  equation may occur in either order; optional whitespace/entity decoding does
  not introduce extra text or numbers. No reliance on unknown classes/hrefs.
- The new contract does not accept bare amounts, generic exchange labels,
  product prices, another element type, extra/malformed numbers, explicit-date
  text, tomorrow/yesterday language, scripts, comments, forms or input values.
  Existing explicitly dated legacy widgets continue to work unchanged.
- Multiple current anchors, or current anchor versus legacy same-day evidence,
  must agree numerically. No preference silently resolves conflicting values.
- HTTP403/429 handling, Retry-After, body/timeout limits, one-call claim/lease,
  changed-only writes and last-good preservation remain unchanged. Recognized
  security/login/CAPTCHA pages now fail explicitly as SOURCE_ACCESS_CHALLENGE,
  including a page carrying an otherwise plausible exchange anchor.

## Day inference — not an explicit provider publication date

The source's observed label says **today**, but supplies no calendar date.
Existing approved policy in [MIDNIGHT_COLLECTION_RECOVERY_2026-10-11.md](MIDNIGHT_COLLECTION_RECOVERY_2026-10-11.md)
already treats this as CURRENT_WIDGET: an observed current internet-shop rate
for the actual request's KST day. This is a documented inference from that
label and request timing, not an explicit effective/publication date or proof
of an airport-store/payment/market rate.

The caller supplies the real request day. #416's midnight guard rejects an
undated response if retrieval completes on another KST day. No tomorrow value,
historical backfill or synthetic observation is created. Explicit tomorrow
remains possible only through the unchanged dated legacy contract. If product
policy requires an explicit source date rather than CURRENT_WIDGET, this
undated rate must be withheld instead of relabeled; this patch retains the
already approved CURRENT_WIDGET policy.

## Existing blocked guard: proposal only, not implemented or executed

The 02:10:27 selector failure imposes the existing 24-hour wait, approximately
until Oct22 02:10 UTC. Exact `attempt_at` and `next_due_at` must be read from
stored coverage/authorized read-only operations; log print time is not a DB
field. Installing a corrected parser alone deliberately does not release it.

**Default safe path:** leave the guard unchanged; the first naturally eligible
existing job after that time can try the repaired parser once.

**Optional urgent repair, requiring root's separate exact-operation review:**
a single compare-and-set of *only* `next_due_at` for the observed incident row,
after the repaired commit passes CI and is the selected production/main code.
Use a reviewed one-time migration or an existing explicitly authorized
production operation; do not acquire credentials or invent an ad-hoc access
path. First capture the exact state, then require all predicates:

- vendor=shilla, status=BLOCKED, error_code=SELECTOR_UNVERIFIED;
- `attempt_at` and `next_due_at` exactly match the captured incident row;
- no active lease and no verified row for the current KST day;
- target due is earlier than captured blocked due, but **not before one hour
  after the latest source request**, counting the 02:21:09 diagnostic too:
  earliest 2026-10-21 03:21:09.208 UTC (recompute if another request occurs).

Change no status, error, last_success_at, observation, source date, value or
verified timestamp. A successful CAS changes exactly one operational row;
a repeat matches zero because next_due_at has changed. A later failure changes
attempt_at, so the same authorization cannot release that failure. Refuse all
403/406/429, access-challenge, unknown-error, active-lease or changed-state rows.
No general bypass flag, reset loop, retry cadence change or scheduler is added.

Then **wait for the next existing natural job**, with its ordinary one-call
claim and fresh-page validation. No force dispatch/full collection is needed.
If it fails again, retain the normal guard and last-good data; no second release
or retry is authorized. Require actual SUCCESS plus CURRENT coverage/date and
fresh verifiedAt, then API/UI observation before claiming restored production.

This would be one incident-specific additional eligibility event, not an
assertion of official automated quota (still unverified), nor permission for
aggressive/short repeated source reads. It must remain separately approved;
this parser patch includes **no** store, migration or workflow change.

## Validation scope

37 focused FX tests pass, including two real local workerd/D1/API cases.
New fixtures cover observed anchor/legacy compatibility, current-day inference,
explicit legacy tomorrow, missing/mixed/ambiguous/conflicting values, challenge
pages, one-call collection/semantic deduplication, midnight rollover, and zero
requests under existing selector/security guards. All provider fetches in these
tests are injected fixtures. Focused lint/typecheck/scheduler/secret-pattern and
diff results belong in the commit handoff; no full build/history scan or live
repaired collector run is claimed here.
