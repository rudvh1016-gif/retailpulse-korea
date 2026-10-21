# KORETAIL — one-time Shilla selector incident eligibility proposal

**DRAFT / DO NOT MERGE before parser production deployment, completion of all
older-code FX jobs, latest source/state recheck and root's separate execution
review.** Publication is permission to run ordinary PR CI only, not permission
to mutate production. No auto-merge. Diagnostic #418 must not be merged.

Base: main `eb2b803d647519befb640dadf38cbddf9a53b4a8`, which includes parser
#419 (tested head `5ce8a421d12600320416d0a6dd350779bf15dcdb`). Parser PR CI
39535926659 passed unit1912/render51/criticalUI5/E2E1493; that is not proof that
this merged main is deployed. Main/deploy evidence is a separate mandatory gate.

## Why a one-time eligibility change is proposed

The actual old collector failed SELECTOR_UNVERIFIED, not an access denial. The
reviewed one-shot public homepage diagnostic #418 returned a narrow anchor with
`오늘의 환율` and a USD1 equation. #419 repairs only that contract and retains
strict legacy parsing, ambiguity/challenge guards and request-KST-midnight rules.
CURRENT_WIDGET remains inference from the source's current-day label and actual
request KST day, **not an explicit provider publication/effective date**. Neither
this proposal nor the parser injects a diagnostic rate into canonical data.

A verified parser does not itself shorten the existing 24h guard. Exact stored
incident evidence from [natural run39534064040 / job119006486989](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39534064040/job/119006486989)
and confirmed by [post-deploy run39536138583 / job119013111397](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39536138583/job/119013111397):

- vendor shilla, BLOCKED, SELECTOR_UNVERIFIED
- attempt_at `2026-10-21T02:10:25.714Z`
- next_due_at `2026-10-22T02:10:27.047Z`
- LAST_GOOD service date2026-10-20, effective verifiedAt00:53:15.429Z
- zero source requests and zero writes in those cooldown-skip observations

The effective verifiedAt does not reveal raw last_success_at. The migration does
not guess or modify it. The only current writer of that column is success
recording, which also sets status SUCCESS; claims and later failures change other
exact-match predicates. The tests preserve even unknown/null legacy values.

## Exact narrow mutation

`drizzle/0030_shilla_selector_incident_20261021.sql` is the unchanged reviewed SQL.
SHA256: `4029d85bf084f563a12b2c75cc67d44c666498e944c60a6d997be779087eb2e3`.
The tests pin this hash. It changes only next_due_at, and only for the exact
incident with null+empty lease, no current-KST-day daily/current row, and the
reviewed KST day. Any mismatch is a no-op. Status, error, attempt, lease,
last_success_at, rate, date, verified timestamps and all canonical rows stay intact.

Target: `2026-10-21T03:21:10.000Z`. This is one hour after the latest known actual
source request (diagnostic02:21:09.207598 UTC), rounded UP to02:21:10. The code
checks the ordinary source-attempt minimum too. Root must recheck there has been
no later out-of-band source request: SQL cannot discover an unrecorded diagnostic.
If there was one, do not merge this fixed proposal; it needs separate review.

Expiry: `2026-10-21T15:00:00.000Z` / Oct22 00:00KST. It can only shorten this
one incident's due time during Oct21 KST. Exact original next_due_at prevents a
repeat release; a later attempt_at prevents release of a subsequent failure.
It never releases HTTP403/406/429, security challenge, unknown errors or leases.
No retry loop, general force/reset option, schedule, secret or provider call is
added. The existing natural collector remains the only requesting path.

## Required merge/execution gates and existing runner

1. Main containing #419 has passed its own CI and actually deployed. Verify the
   deployed revision rather than only merge/CI status.
2. No older-code realtime/FX job is queued, waiting or running. Realtime checkout
   lacks a current-main check, unlike the startup FX job, so this gate matters.
3. Re-read latest natural coverage/attempt evidence; exact incident still holds,
   today is missing, no newer source request, and expiry has not passed.
4. Root approves the exact candidate and one-time production execution. Review
   current main for filename0030 collision before merge. Never enable auto-merge.
5. Normal main CI and Deploy Cloudflare perform the existing production migration
   command. No new trigger, dispatch, credentials or alternate access path.

Existing runner: package db:migrate:production is Wrangler `d1 migrations apply
DB --remote --env production --config wrangler.production.jsonc`; production DB
binding points to retailpulse-korea-production and migrations_dir=drizzle.
Deploy checks current main, records a D1 recovery bookmark, lists pending files,
preflights schema, applies pending migrations and verifies registration. It then
uploads the Worker. **Migration application precedes that upload**, which is why
prior parser deployment is required before merging this separate incident change.
Filename registration adds idempotence; the SQL itself is independently a no-op
on replay or expiry. No rollback SQL should restore an earlier due time.

A successfully registered migration does not prove the CAS matched. Check the
next natural coverage/attempt log. Do not retry a no-op/unknown administrative
result or create another release. On another source failure keep the normal
guard and last-good data. Only actual providerRequests1 SUCCESS + CURRENT date +
fresh verification and stored API/UI evidence establish recovery.

## Offline tests / limits

`node --experimental-sqlite --test tests/shilla-selector-incident-migration.test.mjs`
runs19 cases using only in-memory SQLite and actual0022/0024 schemas. They cover
one-field-only mutation, raw last-success preservation, repeat/later-incident
no-op, state races, security/throttle/unknown refusals, leases, current-day rows,
exact expiry and source minimum interval. SQL clock injection exists only in
tests. Full CI runs these automatically via the existing test:unit glob.

No production D1 call or source request was made to prepare this draft. Local
SQLite success is not live D1/collector recovery. At preparation, Cloudflare's
existing browser session led to login, so no authentication/Studio/SQL action was
attempted; the existing reviewed migration path remains the only proposed route.
