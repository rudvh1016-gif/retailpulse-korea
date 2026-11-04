# Ponytail adaptation and scoped stability checks

## Scope and provenance

This repository uses an instruction-only adaptation in `AGENTS.md`; `CLAUDE.md`
points to that single source. Existing project safeguards take precedence. No
upstream package, plugin, hook, telemetry, session import or runtime service is
installed. No collector, recovery executor, schedule, UI, forecast or D1 write
policy is changed by this adaptation.

Reviewed official source: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail),
revision `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` (verified through the GitHub
commit API on 2026-11-04 UTC). Reviewed `AGENTS.md`, `skills/ponytail/SKILL.md`
and `LICENSE` at that revision. The adaptation retains code inspection, reuse,
minimal complete changes and mandatory safeguards, without the upstream mode
switches or installation machinery. Upstream benchmark percentages are not
evidence for this project.

## Existing harness and focused gate

The existing architecture and activation boundaries remain in
[`docs/OPERATIONAL_HARNESS.md`](../OPERATIONAL_HARNESS.md). This runbook adds a
focused development command, not another orchestration framework.

Run from a clean isolated worktree with Node >=22.13 and locked dependencies:

```sh
git fetch origin
git rev-parse origin/main
npm ci --ignore-scripts
npm run test:stability
npm run health
```

`test:stability` selects existing deterministic suites for lifecycle truth,
recovery admission/budgets/locks, migrated in-memory SQLite bookkeeping,
orchestration planning, scheduler uniqueness, browser shard completeness and
summary refresh recovery. It needs no production credentials or browser. It
does not dispatch workflows or activate collection. `health` is a separate
read-only diagnostic; run with no production credentials for a checkout-only
audit. Missing runtime enablement/usage/publication evidence remains UNKNOWN.
Do not run `operations:memory` record/release modes as a local quality check.

The planner's execution status describes whether planning completed; its
production verdict describes the supplied evidence. A stuck controlled attempt
requires `DEGRADED` even if incidents are empty or resolved. No incidents and no
stuck attempts remains `UNKNOWN`, not a production health assertion.

The focused gate supplements the full release gates:

```sh
npm run secret:scan
npm run lint
npm run typecheck
npm run test:unit
npm run build
node --test tests/rendered-html.test.mjs
node scripts/audit-dependencies.mjs
node scripts/check-browser-shards.mjs
npm run test:e2e
```

The repository's full commands target the Linux CI environment. On Windows,
preserve repository LF bytes for protected-file hash checks; CRLF conversion
can fail those checks without a source change. Native equivalents can invoke
the installed ESLint/TypeScript CLI and explicitly enumerate unit test files.
Record the exact invocation and environment; do not label a skipped Linux or
browser check as passing. The existing CI browser inventory generates four
disjoint shards; the full regression matrix depends on inventory and verify.
Do not replace it with the focused gate or dispatch a production workflow.

Before handoff, fetch main again, audit any newer commits, inspect the diff and
record exact SHA, test counts, failures, skipped checks and PR/check links.
Coordinate with owners of concurrent branches; never overwrite their work.

## Token measurement: UNVERIFIED

No comparable runtime token/cost measurements were available for this change.
Instruction length, changed-line counts and synthetic task scores are not token
savings. A feasible future comparison:

1. Freeze a public, secret-free task set and baseline commit. Use clean isolated
   copies with identical model/version, tool access, dependency cache and prompts.
2. Compare existing instructions against this adaptation, retaining every safety
   rule in both arms. Counterbalance task order and repeat each task several times.
3. Use only supported per-run usage counters, with the owner's authorization;
   do not import session logs. Record input/output/cached tokens separately,
   elapsed time, retries and provider pricing/date if cost is calculated.
4. Apply the same acceptance, security, regression and review gates to both arms.
   Report failed tasks and quality differences alongside usage, medians, spread
   and sample count. Never count a cheaper incomplete result as a saving.
5. If comparable counters remain unavailable, keep savings UNVERIFIED.

## Upstream license notice

MIT License

Copyright (c) 2026 DietrichGebert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
