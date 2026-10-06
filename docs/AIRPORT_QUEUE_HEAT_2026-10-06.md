# Airport queue wait colors and heat — local handoff

This is the first local heat implementation record. The owner's subsequent three-representative request supersedes the default card count and prepared hash below; see `AIRPORT_QUEUE_REPRESENTATIVES_2026-10-06.md` for the current handoff and validation.

Scope requested by the owner on 2026-10-06: stronger warm color as actual waiting time rises, with subtle rising heat for long waits. Local implementation and verification only; the lead owns publication. Base: `ef0e98c79ab92bafe5418c8baea0e62329d0c126`.

## Evidence and data boundary

- The Windows Library materialization of `libfile_6e1f3fa91e008191a0c0ecdaab099d58` failed at metadata installation (`os.setxattr` unavailable), after the one actual download retry. No successful local reference image or pixel inspection is claimed. The original blocker record remains outside the worktree; no further download or helper alteration was attempted.
- The lead subsequently authorized inspecting the same existing public cards independently. `https://koretaildata.com/ko/airport?terminal=T2` returned HTTP 200 on 2026-10-06 at 13:12:41 UTC. Eight cards and the actual screenshot were inspected (`outputs/public-queue-before.*`). The observed values then were 6 minutes / 52,45,45,44 people in hall 1 and 0 minutes / 0 people in hall 2, observed 22:07 KST. These values are evidence only and are not hardcoded in product code.
- Reuse the existing verified **T2** contract in `docs/DATA_SOURCES.md`: <20 minutes, 20–<40, 40–<60, >=60. Do not infer this classification for T1. Exact minutes and the documented `60+` lower bound can receive a category; arbitrary ranges or unknown strings cannot.
- Reuse the API's existing 20-minute freshness limit (`app/api/live/summary/route.ts`), plus the current presentation clock. A stale flag, old/future/unreadable observation, absent wait, nonoperating state or unverified terminal/checkpoint does not receive heat. Missing provider rows remain omitted; an actual zero remains zero. Counts never determine color.

## Implementation and visual review

- `lib/airport-queue-heat.ts`: classification and four-language labels with an English fallback.
- `app/airport-queue-scene.tsx`: the existing identical Blender WebP illustration inside a warm backdrop, plus a text category. People/equipment do not change with the queue.
- `app/airport-models.css`: peach / amber / orange / red, with gray for neutral states; PC4/mobile2 and all existing font sizes unchanged. Black DOM text is outside the colored figure on white (21:1 contrast). Text labels make the distinction available without color.
- `app/live-signals.tsx`: replaces only the illustrative image with the scene, adds the T2 color explanation, and keeps nonnumeric provider status text free of a false minute suffix. Existing sorting, folding, actual counts/minutes/raw ranges and observation time remain in HTML.
- Heat is three faint strokes animated only via transform/opacity, once for 1,800 ms plus at most 320 ms stagger. It starts only when at least half the scene is visible and the document is visible, stops when either is false, and does not replay after cancellation. Reduced-motion stops CSS and JS activation; observers and listeners are removed on cleanup. No per-frame JS, timers, added dependency, canvas/video runtime or new API requests.
- This narrowly requested effect is an owner-requested exception to the older visual-language rule against decorative motion. There is no claim that Adobe After Effects was used.
- Reviewed against vendored frontend-design/web-design-guidelines and the current upstream web-interface-guidelines (2026-10-06), plus React best practices. No remaining functional review finding in the changed scope. Background browser checks use controlled `document.hidden`/`visibilitychange`; they do not claim an OS-level background power benchmark.

## Validation

- Full lint: 0 errors, 7 existing img warnings. Typecheck: PASS.
- New classification unit cases: 4 PASS, including 0/6/19/20/39/40/59/60/120, 60+, null, closed, stale, invalid/future dates, T1/unknown gate, and locale fallback.
- Full unit run: **1,165 PASS / 2 FAIL / 1,167 total**. One was an unchanged workflow's Windows CRLF mismatch; restoring that checkout file to its exact LF repository content and rerunning its suite gave **15/15 PASS**. The remaining failure is the expected Owner UI Lock mismatch described below. No assertion was removed or skipped.
- Related E2E: **26 PASS / 1 FAIL initially** across the new heat suite and existing queue suite. The only failure was the common fixture resetting the clock in the aging test; corrected its fixture reference time, then that test **1/1 PASS**. Other passing cases were not unnecessarily repeated.
- Build: PASS. Rendered HTML: **42/42 PASS**.
- Secret scan: working tree and all 908 reachable commits PASS. Latest `origin/main` re-fetched before handoff: still `ef0e98c79ab92bafe5418c8baea0e62329d0c126`.
- Browser review: HTTP 200, no error overlay, no page or console errors, home content present. Controlled visibility cancels active heat; reduced motion, finite animation, offscreen stop, no replay, responsive columns, keyboard folding, repeated clicks, terminal switch and unchanged actual values verified. See `outputs/local-browser-review.json`.
- Screenshots `outputs/queue-heat-{320,390,430,1280}.png` show **test fixtures**, not live observations. All four inspected. `outputs/queue-heat-motion.png` captures the effect. The separate `public-queue-before.png` is the actual public site before this change.

## Protection and publication handoff

`tests/fixtures/phase2-locks.json` and every protection assertion are unchanged. Do not describe all checks or CI as green.

Only `app/live-signals.tsx` differs from its protected content (SHA256, LF bytes):

- Existing: `eaf2709b09abd8b88996aea680ae07df1745277f04849407e9d4ebd1aae45509`
- Prepared: `472a384c7f82a9d6e765b95c243df30160bbfcea01d09e67acb4766556c67b1e`

The normal protected-baseline decision and record, commit/push, PR, complete CI and any merge/deployment/public verification remain with the lead. No old blocked PR was touched; no new publication action was attempted here. Checkout-only LF restoration produces no content diff for any unrelated file. No data, schema, source, schedule, account or paid-service changes.
