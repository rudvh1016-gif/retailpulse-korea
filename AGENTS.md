# KORETAIL — Shared AI Instructions

This repository is worked on by multiple coding agents, including Codex and Claude Code.

## 2026-09-12 quarterly direction review

For product priorities, token-free operations, exceptional AI handoff, and the next 90 days, read `docs/KORETAIL_NEXT_QUARTER_MASTER_KO.md`. The independent review entry is `docs/KORETAIL_PRO_REVIEW_PROMPT_KO.md`.

These are OWNER_REQUESTED / PRO_REVIEW_PENDING planning documents, not permission to start a Routine, create a live next task, change billing, merge, or deploy. Preserve the existing user-validation gates in `docs/product/PRODUCT_DIRECTION.md` and `docs/product/PILOT_VALIDATION.md`. Reuse the existing Tourism Desk, forecast, diagnostics, recovery, and quota components; do not rebuild them.

Historical statements below about disabled collection are not live-state evidence. Compare current workflows/configuration and `docs/REALTIME_SCHEDULER_AUDIT.md`, report conflicts, and preserve the one-authoritative-collector rule. Do not silently activate a competing scheduler. Ordinary checks must not invoke an LLM; any GPT/Claude review consumes usage and needs the separately verified handoff/budget boundary.

## Canonical brand

The owner approved the final public brand on 2026-08-26 KST:

`KORETAIL`

Meaning: **Korea + Retail**

Preferred descriptor:

`Retail Demand Signals for Korea`

`RetailPulse Korea` is now a legacy public name. New public-facing UI, SEO, marketing copy and documentation should use `KORETAIL` unless a compatibility reason temporarily requires the legacy identifier.

For any branding/naming task, read:

- `docs/BRAND_DECISION_KORETAIL.md`
- `docs/BRAND_RESEARCH.md`

Do **not** blindly rename active technical identifiers such as repository slug, Cloudflare Worker/D1 IDs, environment variables, secret names or deployment bindings. Migrate them only with a compatibility-safe plan.

Before changing anything:

1. `git fetch origin`
2. inspect actual `origin/main` HEAD
3. read this file
4. read `CLAUDE.md`
5. read `docs/SHARED_PROJECT_STATE.md`
6. read `docs/BRAND_DECISION_KORETAIL.md` when branding/naming is involved
7. read `docs/ENGINEERING_DIRECTION.md`
8. read `docs/ZERO_COST_HYBRID_AUDIT.md`
9. read relevant production/data/forecast/security docs
10. audit any commits newer than the SHA mentioned in the prompt

Canonical engineering direction:

- `docs/ENGINEERING_DIRECTION.md`
- `docs/ZERO_COST_HYBRID_AUDIT.md` is the mandatory pessimistic audit gate before architecture-changing implementation.

Hard rules:

- Never assume the prompt's SHA is latest.
- Preserve the zero-paid-runtime policy except for an explicitly approved domain.
- Prefer the benchmark-gated hybrid architecture: GitHub Actions for heavier scheduled collection/forecast/outcome work, Cloudflare Worker for lightweight serving/read APIs, Cloudflare D1 for persistent canonical storage.
- Heavy Worker Cron work is not authoritative by default; benchmark first.
- Do not enable duplicate live schedulers for the same source.
- D1 collectors must not blindly rewrite unchanged rows; semantic changed-only writes must be measured and tested.
- Scheduling runs on two platforms today, and `npm run health` derives the real graph from configuration: trust it over any prose, including this line. Cloudflare Worker Cron carries five trigger-only expressions that each dispatch one allowlisted workflow and touch no provider and no D1; GitHub Actions cron drives the daily, early-A1, weekly-sales and transfer groups. What the realtime audit removed is the HEAVY Worker `scheduled` handler, not the alarm clock.
- Never run two timed schedulers for one source. Adding a GitHub `schedule:` block to a workflow the Worker already dispatches creates exactly that, and `tests/scheduler-truth.test.mjs` fails on it.
- `collect-production.yml` is gated by `vars.ENABLE_PRODUCTION_COLLECTOR`. That Variable is GitHub state, not repository state: report `RUNTIME_ENABLE_STATE_UNKNOWN` from a checkout and never assert that the collector is disabled.
- Do not keep unlimited repeated raw snapshots; use explicit current/change-history/aggregate/retention classes while preserving audit evidence.
- Free-tier guardrails are 70% NOTICE / 85% PROTECT / 95% EMERGENCY per resource, and must distinguish official usage from internal estimates.
- Do not claim `LIVE`, `PASS`, free-tier safety, traffic capacity, or bug-free without evidence.
- Do not expose API keys or credentials in code, Git history, frontend bundles, logs, screenshots, or AI messages.
- Preserve truth boundaries: visitor != tourist; foreign presence != purchase; proxy != sales; flight != passenger nationality; forecast != actual; backfill != prospective.
- Predictions are immutable/append-only and outcomes remain separate.
- Activate sources one at a time after terms, HTTP contract, timestamps, quotas, parser, D1 write, stale/error, and redaction checks pass.
- If current code conflicts with canonical docs, report and resolve the conflict deliberately rather than silently following an older note.
- Preserve the existing product/UI direction unless the owner explicitly asks for redesign.

## Owner UI lock — 2026-09-13

Preserve white-first, compact typography, thin rules, restrained spacing and minimal blue.
Reuse the existing type/weight tokens; do not redesign the typography scale or change a
font size by 2px or more without owner approval or a demonstrated clipping/accessibility
defect. Location, day and terminal selection use text with a thin bottom indicator, never
blue rectangular borders, blue fills or large pills. Population observations are neutral;
official forecasts use a restrained dashed blue range edge. Preserve exact min/max bands,
missing intervals and personal preferences. All main screens use the shared safe-area header.

## 작업 완료와 GitHub 기록

**최종 기록의 기준은 GitHub다.** Claude Code·Codex·GPT 등 모든 작업자는 사용자의 보고 복사·붙여넣기 없이 최신 GitHub만으로 마지막 작업을 복원할 수 있게 한다.

1. 변경이 있으면 저장소에서 요구하는 테스트·검증 → 커밋·push → PR → 해당 커밋의 CI 확인 → 안전하면 병합 → 최신 `origin/main`을 다시 받아 반영 여부·검증 상태 확인까지 진행한다. 기본 브랜치가 다르면 그 브랜치를 기준으로 한다.
2. PR 본문 또는 기존 STATUS/운영 문서에 작업 목적·결과, 변경 파일, 실제 검증 명령과 결과, 커밋 SHA·PR/CI 링크, 병합 여부, 남은 일과 막힌 이유를 기록한다. 병합 후에는 확인한 최신 main SHA와 최종 상태를 PR 본문/댓글 또는 운영 문서에 갱신한다.
3. 코드 변경이 없는 조사도 변경하지 않은 이유, 조사 결과·근거(확인한 SHA·파일/실행/자료 링크), 검증 한계와 남은 일을 해당 저장소의 GitHub Issue/기존 인계함 또는 STATUS/운영 문서에 남긴다. 기록만을 위해 빈 코드 커밋이나 빈 PR을 만들지 않는다.
4. 결과를 Claude 채팅에만 남기거나 로컬 브랜치에만 두지 않는다. 미완료 작업도 원격 브랜치·draft PR 또는 Issue에 진행 상황과 재개 방법을 남긴다. 기존 채팅 보고 형식은 유지하되 GitHub 기록을 대신하지 못한다.
5. 기존 안전정책·승인 범위·필수 리뷰·브랜치 보호·배포 절차를 우선한다. 실패/미확인 CI, 충돌, 권한 부족, 필요한 승인 미충족이면 강제 병합하거나 우회하지 말고 원인과 다음 조치를 기록한다. CI가 없거나 실행되지 않았으면 통과라고 쓰지 말고 적용 가능한 검증과 그 한계를 적는다.
6. 기록에 Secret·토큰·계좌정보·비공개 원본 자료를 넣지 않는다. GitHub 쓰기까지 막히면 로컬에 인계 자료를 보존하고 사용자에게 저장 실패·필요 권한을 알린다. GitHub 기록 전에는 저장·인계 완료라고 보고하지 않는다.

기존 운영 인계 문서는 `docs/SHARED_PROJECT_STATE.md`이며, 실제 최신 작업 근거는 해당 PR/Issue와 최신 main을 함께 확인한다.

Before push:

- run applicable lint/typecheck/unit/build/render/E2E/secret checks;
- run the applicable items in `docs/ZERO_COST_HYBRID_AUDIT.md`;
- commit and push;
- report exact commit SHA, changed files, tests run, remaining blockers, and any owner action required.
