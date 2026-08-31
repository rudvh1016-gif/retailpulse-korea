---
name: gpt-report
description: Produce the Korean handoff blurb for reporting KORETAIL work to GPT/Codex or the owner. Use when the user asks for 지피티 보고용 문구, GPT 보고, 보고용 문구, a handoff summary, or a status blurb to paste into another assistant. Gathers the real SHA, deploy run, test counts and source health first, then emits one copy-ready block.
---

# GPT 보고용 문구

Produces one paste-ready Korean block summarising the current state of the
KORETAIL repository, for handing to GPT/Codex (another agent works this repo)
or to the owner.

## Rule that matters most

**Every number in the report must come from a command run in this session.**
Never carry a figure over from memory or from an earlier report — a handoff
that quietly restates yesterday's SHA or a stale test count is worse than no
handoff, because the reader has no way to tell it is stale. If a fact cannot
be gathered, write `확인 못 함` for it rather than guessing.

## 1. Gather the facts

```bash
git fetch origin main --quiet
git log --oneline -1 origin/main                 # 최신 main SHA
git diff --name-only <deployed_sha>..origin/main # 배포 이후 바뀐 파일 (재배포 필요 여부)
```

For the deploy run, the merged PRs and CI, use the GitHub MCP tools
(`mcp__github__actions_list`, `mcp__github__pull_request_read`), not guesses:

- latest `deploy-cloudflare.yml` run → id, conclusion, `head_sha`
- its job log → `Current Version ID`
- latest `site-smoke.yml` run → the `serves the current build` check
- `inspect-production-operations.yml` → per-source health + `dataCoverage`

Run the local gates only if the working tree changed since they last ran:

```bash
npm run secret:scan && npm run typecheck && npm run lint
npm run test:unit          # 유닛
npm run build && node --test tests/rendered-html.test.mjs
npm run test:e2e           # Playwright
```

## 2. Decide the redeploy line honestly

If `git diff --name-only <deployed_sha>..origin/main` touches only
`.github/`, `docs/`, or test files, say **재배포 불필요** and give the reason.
If it touches anything in the Worker bundle (`app/`, `lib/`, `worker/`,
`db/`, `public/`), say a redeploy is required and whether it was done.

## 3. Emit the block

Output the report inside **one** fenced code block so the user can copy it in
a single action, and save a copy:

```bash
mkdir -p .claude/tmp && cat > .claude/tmp/gpt-report.md <<'EOF'
...report...
EOF
```

Keep it under roughly 40 lines. Use the template below, dropping any section
that has nothing true to say. Plain Korean, no loanword jargon
(펄스/인사이트/시그널 등 금지 — the product itself bans them).

### Template

```
[KORETAIL 진행 보고]

■ 현재 상태
- main: <sha> (<제목>)
- 배포: Deploy Run <id> / Version <version-id> / 대상 SHA <head_sha>
- 배포 이후 변경: <파일 또는 없음> → 재배포 <필요/불필요> (<이유>)

■ 이번에 한 일
- <사용자가 체감하는 변화 위주로 3~6줄. 커밋 제목 나열 금지>

■ 검증 (실제 실행한 것만)
- secret:scan / typecheck / lint: <결과>
- 유닛 <n>/<n>, 렌더링 <n>/<n>, E2E <n>/<n> (<모바일 폭>)
- 프로덕션 실측: <site-smoke 검사 결과 — 구버전 여부까지>

■ 데이터 소스 상태
- 정상: <목록>
- 문제: <소스> — <원인> (<화면 영향 있음/없음>)

■ 남은 것 / 막힌 것
- <해결 못 한 것만. 없으면 "없음">

■ 다음에 필요한 판단
- <오너 결정이 필요한 것. 없으면 생략>
```

## Tone

Write for someone who was not in the session: name the user-visible change,
not the refactor. State blockers plainly and never soften them — a report that
hides a failing source is the failure mode this template exists to prevent.
