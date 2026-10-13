# Exact deployment revision verification — 2026-10-13

## Scope and authorization

Owner follow-up `Sentinel_bc1118daf27881919bfdc579622a8c7c` authorizes the three stability code preparations
This branch starts at `dbf900ffb8ac5911e2b7c279c3f314de63c67764`; audited remote main was `fea8249c3bcef134077684cb5c92049ea83bb477`
This is a Draft PR only, with no merge, deployment, repository protection change, collector activation, new schedule or paid dependency

## Change

The build embeds its actual Git HEAD and dirty status as an explicit public allowlisted value
`/api/build` returns the revision with no-store and without DB/provider access
The root HTML exposes the same revision in two metadata fields without changing the visible design
A successful deployment uploads its checked-out SHA as a 14-day artifact
Production visual checks download that specific run artifact and check out that exact revision's specs
Both API and raw HTML must match the artifact and report a clean build before and after the browser suite
Two hydrated browser checks at 390 and 1440 pixels also require that SHA
Missing artifact, missing metadata, dirty build, stale HTTP 200, mismatch or a revision change during verification fail closed
Manual visual verification uses the selected checkout revision, never an assumed current deployment

Five existing fixture-based UI cases run before the unchanged full E2E suite: mobile SSR hydration, passenger terminal/date, partial daily coverage, failed/mismatched data and explicit zero PM
The selection was enumerated as exactly five tests before execution

Operational health is recorded separately from release identity
Weather run https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/38391976274 succeeded with PARTIAL 1/4 coverage and STALE source health
Workflow success cannot mean full recovery; even reported healthy statuses are not independently verified recovery
This change does not alter existing collector or recovery orchestration

## Repository protection proposal — NOT applied

Read-only inspection found main branch protection absent (404) and no rulesets
The actual CI check is `verify`, published by GitHub Actions app ID `15368`
Proposed exact target is `refs/heads/main`
Require a pull request and successful `verify` from app `15368`, with the branch current with its base
Block force pushes and deletion
Bypass actors: none, including administrators
No extra reviewer quota or linear-history requirement is proposed
Before any policy mutation, obtain the separately required action-time confirmation covering this target, impact and absence of bypass
No API write to protection or rulesets has been made

## Validation and limits

TypeScript, relevant ESLint, five deployment contract tests and 44 existing operational phase-two tests including UI Lock passed locally
All 65 protected file paths and all previous approval records remain present
Only layout metadata changes the protected UI surface, recorded in `docs/approvals/release-verification-20261013.json`
Five selected browser tests and clean-build/render verification are recorded in the PR validation update after execution
Native Windows invokes `node node_modules/vinext/dist/cli.js build`; the repository bash wrapper is not claimed to run locally
Hosted CI still executes the original Linux wrapper and full suite

Cost/security audit: no new scheduler, provider calls, D1 writes, environment enumeration, key or paid dependency
Build metadata is public SHA plus dirty state only
Per existing visual run, revision checks add four lightweight API/HTML reads and two health reads, bounded to 20 seconds each without retries
Health reads existing canonical status; it does not refresh upstream data
Existing source timestamp semantics, immutable predictions, zero-cost guardrails and A1 direct-only scope remain unchanged
No claim of traffic capacity, public deployment verification or complete recovery is made from this draft's local tests
