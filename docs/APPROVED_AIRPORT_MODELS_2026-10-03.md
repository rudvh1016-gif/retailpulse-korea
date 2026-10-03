# Approved airport models implementation

Base: origin/main 166e8c42adea99f0ebb436f412808ab53cb92b2b. Isolated branch: codex/approved-airport-3d-20261003. Existing work/visual-overview was inspected and preserved.

Approved local catalog and C/D reference pixels were inspected. D uses the approved data-free airport render, with responsive 480/900/1800 WebP variants and dynamically computed labels. C uses lightweight SVG prisms whose height follows the actual full-day flight count. Every tied leader is included; there is no six-gate cap. The full searchable gate list includes known zero gates, unknown coordinates, terminal and zone filtering, flight details and the official map. Partial responses withhold definitive leaders. Physical-flight deduplication and cancellation filtering use the existing departure map calculation.

The model is conceptual, not official geography. Gate counts are flights, not passengers or waiting people. East/west denominators, center/concourse/unverified distinctions, destination totals and withheld passenger estimates remain intact. Destinations and official coordinate views initially collapse but retain complete content. Existing arrival, flights, facilities, store, history, eight-industry guidance and auxiliary area navigation remain available. Industry and area images use approved assets; monthly and similar-history figures use real values rather than demo image numbers.

Existing font files, family, sizes, weights and global typography were preserved. Approved black text and white backgrounds replace the older hero colors. Images reserve dimensions and load lazily; mobile D requests the 9,910-byte variant instead of the 49,184-byte original. No 3D engine, dependency, provider, collector, database migration or paid service was added.

## Validation

- lint, typecheck, production build and secret scan pass.
- 1,149 unit tests pass; 42 built-HTML assertions pass.
- Existing E2E suite: 396/402 first-pass; six color-expectation/temporary navigation failures were corrected or rerun and all six pass. No tests were disabled.
- Existing priority UI lock: 25 pass. New models suite: 20 pass, covering Korean/English/Chinese/Japanese, 360/390/430/1280 widths, all eight tied leaders at 17 flights, zero, partial and failed responses, search, keyboard details, terminal switching and shared reads.
- Windows path normalization fixes only test portability. The phase2 manifest updates only the user-authorized live-signals design hash; its enforcement remains active, with old/new hashes and reason recorded in the manifest.

## Performance evidence and limits

Saved public baseline: outputs/evidence/public-before-mobile.json. Same cold-cache conditions: 390x844, 4x CPU, 150ms RTT, 1.6Mbps downstream, three runs, observation through 10 seconds after DOMContentLoaded. Median LCP 3.400 seconds and CLS 0.419187. An earlier three-run baseline median was 4.744 seconds and 0.401854, demonstrating variability. Long-task observations are not Lighthouse TBT. Public typography snapshots and C/D screenshots are saved locally. A production after-comparison requires the approved release; a development-server comparison would not establish a production improvement.

This implementation is delivered for review in a draft PR. No public merge or deployment is performed under this delegated scope.
