# Three representative departure halls — local update

Owner request `Sentinel_67e5023f1d8c8191a85c6d68f677de21`, 2026-10-06. Continue the existing local heat branch. Initial and latest fetched main: `ef0e98c79ab92bafe5418c8baea0e62329d0c126`; no newer main commit was found. **Not committed, pushed, merged or deployed.** The lead coordinates protection and publication.

## Result

The default is up to three actual halls: longest wait, middle, shortest wait. PC and mobile both use one three-column row. Only the illustration dimensions and representative spacing change; text stays black at its existing font sizes, without scaling or clipping. Expanding shows the complete original list, still PC4/mobile2, including stale, missing, closed and zero observations. Existing heat colors, motion accessibility, actual people counts and observation timestamps remain.

- Candidates require a LIVE observation within the existing 20-minute window and a comparable displayed wait. Explicitly closed, stale, invalid/future, missing and unsupported range values are excluded from comparison, but retained in the full list.
- Descending displayed minutes determine rank. Counts never determine representative selection. Equal times break by terminal/hall identity, independent of waiting people.
- Middle is the actual row at zero-based `floor((N-1)/2)`: rank4 of8 or rank3 of5. For even counts, use the longer-wait central row. No average or invented observation.
- Ties are labeled. If all displayed waits are identical, all selected roles say the same wait and a note explains equality. With1 candidate show only that hall; with2 show long/short and no invented middle; with0 show an honest empty comparison plus the complete-list disclosure.
- Duplicate terminal/hall identities use their newest record before eligibility filtering, so a later closure cannot revive an older open row. Conflicting records at the same newest timestamp are withheld from comparison. Selected identities never repeat.
- A displayed0 remains eligible as a reported value, with the visible note **0분 표시 · 운영 여부 확인 필요**. It is not a claim of immediate access or known operating status. No operating data was acquired or inferred. Explicit nonoperating rows are excluded.
- The existing `60+` display is unchanged. Ordering uses its documented lower bound and explicitly states that the actual upper bound is unknown. Arbitrary ranges are not parsed into false-exact minutes.
- T1 may be ordered by its actual wait readings, but keeps its unverified category state: no T2 color-threshold inference. In all-terminal scope, select only3 total and label each selected card's terminal.

## Changes and affected validation

New selector/copy: `lib/airport-queue-representatives.ts`. UI wiring and explanatory text: `app/live-signals.tsx`. Three-column sizing and zero note: `app/airport-models.css`. New selector unit and representative E2E suites, and existing heat/card suites updated for the expressly requested default behavior. No test/assertion is weakened or skipped; the old1-card expectation is replaced by3 while full-list, value, keyboard and geometry assertions remain.

- Affected unit suites (`airport-queue-representatives`, `airport-queue-heat`, `ux-truth`): **46/46 PASS**.
- Related E2E suites (`airport-queue-representatives`, `airport-queue-heat`, `airport-queue-model`): **47/47 PASS**. Four languages ×320/390/430/1280px; three cards share a row; no horizontal overflow; same13px heading and black values; actual ranks/counts/time; folding by keyboard and repeated clicks; all-terminal scope; zero warning; stale/missing/closed exclusion; equal/fewer/no candidates; retained finite/reduced/background/offscreen motion behavior.
- Typecheck and changed-file lint: **PASS**, after correcting nullable test fixture types. This fixture-only type correction did not change runtime values.
- All four new representative screenshots inspected. `outputs/queue-representatives-{320,390,430,1280}.png` are **test fixtures**, not live source readings; zero/closed/stale expanded-state evidence is separate.
- Earlier full unit/build/render/history checks were not repeated for this incremental request. Their earlier results belong to the original heat handoff. The existing protected-file assertion remains unsatisfied; no full CI success is claimed.

## Library capture versions

The two original Library identities were **replaced**, never recreated. Official upload helper reported unavailable preparation before any transfer; the official owned-file replacement fallback used expected version0 and returned success version1 for both.

- PC: `libfile_2891fb448d7481919d9151a2e2e2a6d6`, version1, `/queue-representatives-1280.png`, file `file_00000000bd1482309636140f852451c0`.
- Mobile: `libfile_e70b205fb9488191a87f831ba5b44d5a`, version1, `/queue-representatives-390.png`, file `file_000000002e2082308c81020c0cf05d69`.
- Library replacements succeeded. Local metadata attribute writeback failed because Windows Python lacks `os.setxattr`; this was recorded separately without helper modification or a retry. The earlier input-image materialization failure remains historical and was not retried.

## Protection handoff

No protection fixture/assertion was changed. `app/live-signals.tsx` SHA256, LF:

- Existing approved baseline: `eaf2709b09abd8b88996aea680ae07df1745277f04849407e9d4ebd1aae45509`.
- Prior local heat draft: `472a384c7f82a9d6e765b95c243df30160bbfcea01d09e67acb4766556c67b1e`.
- Current three-card draft: `1510ae35fd7d96e6e9ea0dff9eb04e3952bb1d9983300c449960bf01142aadc3`.

The additional protected-file changes are the representative selector import/wiring; selecting3 across the current terminal scope; truthful role/tie/empty/zero text; the representative/full-list toggle label; and ranking/0/60+ explanation. Original count/time fields and full-list observations remain unchanged. This user request is for behavior, not weaker checks. The lead must decide and record the normal baseline update, then handle commit/push, PR/full CI, coordinated deployment and public verification.
