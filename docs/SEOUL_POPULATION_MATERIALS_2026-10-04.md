# Seoul observed and official forecast chart material — draft

This small change covers the shared `PopulationFlow` used on Seoul area/home screens **and the predictions tab's Seoul official forecast chart**. Existing time/value mapping, source segmentation, lower/upper intervals, missing gaps, KST dates, issue/collection times, keyboard/touch selection and upcoming-only peak calculation remain unchanged.

Base: verified main `75d8121e975f92d9ab8f06b02e5459f6ae8ace90`; branch `codex/seoul-population-materials-20261004`. Independent of the Shinhan PR. No API, prediction/outcome math, fonts, package, schedule, or runtime 3D engine changes.

## Rendering and actual-source evidence

`PopulationRangeMaterial` adds constant 4px side/top material faces behind each existing segment. The original front-face range paths and observation intervals are unchanged; missing intervals and different forecast issue times remain separate. Zero never receives invented material volume. Observations retain the existing neutral/black edge; the official forecast retains its dashed blue edge and exact range, with restrained mint material from the reviewed chart contract (`libfile_5ced23953e6c8191bff783447f6b468f`). Native disclosure states that material depth does not encode data.

The scrubber retains its 44px hit area, real time-to-x mapping and keyboard controls. Its centered handle is now 6×18px with restrained material styling; extra top margin is removed. The native guide adds a row, so the whole figure is taller rather than falsely claiming a compactness gain. Plot height stays 216px, slider height 44px, fonts unchanged.

Actual [public summary](https://koretaildata.com/api/live/summary) captured `2026-10-04T07:27:20.450Z`: Myeongdong observation **15:50 KST, 94,000–96,000**; upcoming official peak **17:00 KST, 88,000–90,000**. The peak describes only future published intervals; a higher current reading is correctly excluded. The same forecast continues through **10-05 04:00 KST**, with issue time **10-04 15:50 KST**. Final selection shows **10-05 04:00, 12,000–14,000**. No numbers from this snapshot are hardcoded in production code.

Matched 390/1280px captures from separate unchanged-main and changed servers use this same source snapshot and clock. A strict comparison of every original front path/interval coordinate succeeds at both widths. Horizontal overflow and page errors are zero; no console errors. Reference-model API is explicitly mocked as unavailable only for these official-chart captures; no reference-model accuracy claim is made.

## Validation

- Local full units **1118/1119 pass**, no skips; sole failure is the unchanged Owner UI Lock at `app/area-demand-card.tsx`. The protected CSS import is also changed; fixture/test remain unchanged.
- Lint and typecheck pass; verified build and rendered HTML **42/42** pass. New test fixture metadata was corrected to the existing API type contract; no type checking disabled.
- New browser tests **20/20**: four languages at 360/390/430/1280, exact range/depth separation, source gaps, zero/missing, native disclosure, keyboard scrubbing, upcoming peak below current observation, excluded past high forecast, midnight date and issue time.
- Existing browser regression suites **34/34** passed. Final geometry/safe-area subset plus the new tests **36/36** passed. Existing gray observation and dashed blue forecast edge assertions, date changes, slider/selection alignment and 44px hit area remain active.
- No duplicate run or modification of PR259.

## Library screens

- Official predictions chart mobile: `libfile_3827dc8c0cf48191ae55c44dc590caed`
- Midnight/final forecast selection mobile: `libfile_3e68805b1c408191a053d2b3a3b4ec0a`
- Official predictions chart desktop: `libfile_3094b594d83c819191f3ee1414c44754`

These are local final-source screenshots from actual captured public data, not a deployed change. Fixed bottom navigation is hidden only during component screenshots.

## Approval boundary

The Shinhan task's attempted normal update of `tests/fixtures/phase2-locks.json` was rejected by automatic approval review for lack of exact lock-policy authorization. That rejection remains in force. This branch also changes protected `app/area-demand-card.tsx` and `app/globals.css`; no fixture refresh was attempted here. The original guard visibly fails and is not weakened, disabled or bypassed.

This draft is reviewable, **not fully verified for merge**. The parent will request exact end-user authorization for the normal protected-hash/audit refresh after review. Every other protected hash and assertion must remain intact. Normal unchanged-guard/full CI follows that approval. Public merge/deploy remains a separate approval and has not been attempted.
