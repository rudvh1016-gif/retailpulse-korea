# Airport building ratios and summary cleanup — review only

Base: `21c2990e0d440eb4d30bae633f93520d85cf7b09` (main verified on 2026-10-08).
Branch: `fix/airport-building-shares-cleanup-20261008`.
No merge, deployment, provider collection, paid service, package installation or scheduler change is included.

The all-building picture previously showed one aggregate west/central/east row over T2. It now shows one row inside each of T1, T2 and the concourse. Each row uses that physical building's departures in the selected window, including its unverified-zone flights. Counts reuse the normalized map list, so codeshares, cancellations and window boundaries follow the existing calculation. Unknown buildings remain in the overall denominator and are never assigned to a picture. Single-building modes, confirmed zero, pending gates, one-decimal rounding, date/time controls, country lists, gate evidence and official coordinates retain their definitions. The approved v14 responsive day/night images and geometry are unchanged; no 3D engine was added.

The separately requested IMG_0960 current-hour/peak/weekday strip and its near-term/upcoming text lines are deleted in `app/live-signals.tsx`. The sum/formula, forecast chart, MTD, comparisons, real flight information, observed waits and weather are preserved. The `AirportTopReference` render and its derived passenger allocations are removed from the departure model slot. Source forecast calculations and their unit tests remain; this does not restore held east/west passenger estimates. Existing browser/HTML expectations were updated for these requested UI changes. The original `tests/operational-phase2.test.mjs` and its lock fixture are unchanged.

## New summary removal: approval blocker

Automatic review rejected the single attempted normal fixture update before execution:

> 보호된 UI Lock fixture의 해시와 승인 기록을 영구 변경하는 보안 경계 완화이며, 요약 삭제 요청은 소스 변경을 승인할 뿐 이 정확한 fixture 갱신까지 명시적으로 승인하지 않았습니다.

The source deletion is present for review, but its approved lock hash cannot be updated without exact fixture authorization. The unchanged original enforcement correctly fails for only `app/live-signals.tsx`: approved hash `b5ce612574bf7f12518ad04a2a433ea4e0bab8a5daa271169d4ec030678ab4d3`, proposed hash `149d433a9fc89efeac146e395c90ae70058498242d6fdacc196d331c36fddcbc`. The other 60 protected files, crons, font styles, header and dependencies remain byte-identical. No retry, test disabling or workaround was attempted. This draft is blocked from merge/release.

## Earlier priority card/header: investigation only

The separate old proposal was based on `ef0e98c79ab92bafe5418c8baea0e62329d0c126`, with 53 protected files. Current main has 61 and materially newer source in both old overlapping files: 95 inserted and 76 deleted lines since that base. Copying its whole files would discard subsequent work. Its original UI Lock and two original browser contracts failed, although its new isolated tests passed.

The old exact operation was updating two protected hashes and adding a local approval record to `tests/fixtures/phase2-locks.json`. It was rejected twice; the host's second review did not accept delegated approval evidence. The earlier approval question was already answered and is not repeated here. No old card/header patch was copied, rewrapped, committed, pushed or retried. No card/header integration is claimed. It requires a normally recognized host authorization and reconciliation of the existing guide placement and sum-first contracts before implementation can resume.

## Evidence and limits

The original IMG_0961 and IMG_0960 Library references were resolved via current supported materialization, but both original byte downloads returned HTTP 403. Original local image bytes were not obtained; image-read OCR pointers are not claimed as pixel inspection. The fallback captures are actual public browser pixels of the verified main, followed by local candidate pixels replaying those exact stored public API responses. At that sample, T1 had 159, T2 260 and the concourse 138 departures; these are evidence values only, never production constants.

Local validation: production build, typecheck, full lint (0 errors, 8 warnings, including one now-unused retained brief formatter), rendered HTML 46/46, full unit 1221/1222. The sole unit failure is the unchanged UI Lock above. Applicable browser suite: first 227/257 passed; requested UI contracts and mistaken selectors were corrected; 28/30 then passed and the final two partial-data cases passed. All257 applicable cases have passed across those narrowed runs, with no skips/flaky retries. A tool-interrupted preview also caused30 connection-refused failures in an intervening run; that record is retained separately. No full CI success is inferred from these local passes. Real pixels were inspected for mobile all/T1/T2/concourse and desktop all; candidate captures cover 360/390/430/1280 widths. Four languages, confirmed zero, unknown building, unverified gates, time/date changes, reduced motion, keyboard evidence, stale requests and two-minute refresh are covered by the applicable browser suites. Physical iPhone/Safari was not tested.

Same-condition production static import graph (same installed dependencies and vinext build): JS gzip 413,060 → 411,792 bytes (−1,268); CSS gzip 11,531 → 11,552 (+21). This is a small bundle reduction, not a claim of measured public LCP/PSI improvement. The public baseline and candidate captures are different serving environments and are not used as a speed comparison.

Five new inspected PNGs were offered to the current unmodified official Library upload helper. The first stopped at local path validation because native Python stdin used CP949 for a UTF-8 Korean path. Read-only diagnosis confirmed the file exists with UTF-8 input. With that input setting corrected, the same helper stopped with `Library prepare_uploads is not available`, before confirmed storage. No direct-upload fallback or helper modification was attempted; no new Library IDs are claimed. PNGs and the local review bundle remain under `outputs/building-shares-copy-20261008` in the task workspace.

Next: obtain exact permission for this new one-file lock record, apply only that approved record through normal review, rerun original enforcement and exact-head CI, then request public merge/deployment approval separately. The older card/header authorization blocker remains a separate investigation result.
