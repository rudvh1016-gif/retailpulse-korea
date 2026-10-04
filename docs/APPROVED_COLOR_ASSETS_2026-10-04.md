# Approved color assets integration — 2026-10-04

The approved airport v7, district v3 and shop-interior v4 WebP renders replace the corresponding current illustrations. The airport uses the reviewed v6c composition, dimensions and label anchors; v7 changes material colors only. The physical building selectors, actual flight overlays and source semantics remain those of PR #259.

This is a stacked draft against `codex/airport-passenger-calendar-integration-20261004` at `aa83a20a0d3ed849a69d2078cd91e83e05cc4fb1`. It contains only asset integration and its checks. PR #259's earlier successful full CI is separate evidence; this change requires its own review and checks. No merge or deployment is authorized or performed.

## Source assets and implementation

- Airport v7 ZIP: `libfile_2640542455a08191bb864f703198dda0`.
- Supporting district v3 ZIP: `libfile_eea402b261f481918e7fd3adf458d07f`.
- Shop-interior v4 ZIP: `libfile_05693b3ff1f881918153d4088cdc1784`.
- Original external Blender, PNG and WebP sources are preserved. The original public v5 airport files remain present.
- `config/approved-color-assets.json` records the byte count and SHA256 of all 20 adopted images; tests verify file contents and a 64 KiB per-image ceiling.
- `config/airport-concept-v7.json` uses the approved v6c view geometry and anchors exactly: T1/T2/concourse 1440 × 870, overview 1600 × 826. Tests compare the entire view configuration.
- Only the selected building and day/night image is requested. Existing reserved aspect ratios and lazy image behavior remain; no runtime 3D engine, fonts, dependency or paid service was added.
- Existing browser assertions are retained. Only image version filenames and the approved natural dimensions change in the two affected image assertions.

Conceptual models do not claim official coordinates. Registration country remains distinct from passenger nationality; flight counts remain distinct from passenger counts and observed waiting times. No passenger estimate for east/west zones is restored.

## Asset budget

| Image group | Previous bytes | Approved bytes | Difference |
|---|---:|---:|---:|
| Airport, eight renders | 275,310 | 282,406 | +7,096 |
| District, four renders | 73,410 | 97,788 | +24,378 |
| Shop, eight renders | 189,188 | 128,924 | −60,264 |
| All 20 images | 537,908 | 509,118 | −28,790 (−5.35%) |

This is an aggregate asset-size comparison, not a per-page download, Lighthouse, public LCP or speed-improvement claim. The selected airport scene slightly increases in bytes while shop images decrease. No new public performance measurement is inferred from these numbers.

## Local verification

- Full unit suite: **1,132/1,132**, zero skipped, including the original Owner UI Lock guard.
- Verified production build and rendered HTML: **42/42**.
- Typecheck: passed. Lint: zero errors, two inherited pre-optimized image warnings in the PR #259 calendar and tax-refund components.
- Related Chromium browser cases: **56/56** (33 model/guide cases and 23 building/concourse/day-night cases). Relevant widths include 360, 390, 430 and 1280; languages include Korean, English, Chinese and Japanese.
- Repeated building changes, browser history, selected-image requests, day/night switching, country denominators, search, zero/partial/unavailable/wrong-day responses and horizontal overflow assertions remain active.
- Final review captures: no page errors, console errors or failed responses; every gallery image loaded at its intended natural dimensions. Reduced motion was enabled.
- Original UI Lock fixture and protected source hashes are unchanged in this asset branch. No guard refresh, disable or bypass was used.

These are local checks. Remote CI must be checked at the exact pushed head separately. Physical iOS Safari and a fresh public PSI measurement have not been performed.

## Actual-data visual review and Library deliverables

The local browser uses the public summary snapshot generated `2026-10-04T07:27:20.450Z` and actual public flight/calendar responses. The flight response contains 577 records, `truncated: false`, and its own collection timestamp `2026-10-03T23:44:30.334Z`; this older timestamp is retained, not presented as a fresh collection. Snapshot numbers are confined to ignored review outputs, not production constants. The final T2 departure overlay shows west 131, center 21 and east 120 flights, using its actual 272-flight denominator.

| Review image | Library ID |
|---|---|
| T2 daytime mobile, integrated page | `libfile_7a3bb6b2cd588191be3adf703be64844` |
| T2 nighttime mobile, integrated page | `libfile_5a0c0b1bd4608191bbecb0e3b432d69a` |
| District v3, integrated desktop | `libfile_9931926d7e2c8191a371ce5045c22f75` |
| Shop v4, integrated airport guide | `libfile_642fd2813a088191ba252a6f44b9a462` |
| All eight airport renders, browser gallery | `libfile_fb866f3a377c8191b28350f4f622aad4` |
| All eight shop renders, browser gallery | `libfile_e7bda2d3c490819192275d1e392a997c` |

All six Library creates succeeded at version 0. Local metadata sidecars retain the returned IDs, versions and attributes. Applying local extended attributes was unavailable under this Windows execution account; this does not invalidate the confirmed Library saves.

Public merge and deployment remain separate approval steps. The Shinhan and Seoul material drafts have a separate unchanged Owner UI Lock approval blocker and must not be described as fully verified by this asset branch's passing guard.
