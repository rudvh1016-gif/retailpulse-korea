# Airport glance — approved artwork connected, publication still pending

The requested Library image `libfile_59815a4d20bc8191abc8b10d52ef2e49`, version1, was obtained through the user's existing Whale browser and the ordinary Library download route. The Windows transfer helper was not modified. The downloaded file is `exec-04566c4c-705b-4074-b17a-02d7175ae3a5.png`, 3,030,243 bytes, 1448x1086. Its SHA256 is `1c47eb2bb573444475ce911a606d353a9b7e7a7985f1be421a356558659a2b51`. Actual pixels were inspected before integration; the whole original composition is retained without cropping or regeneration.

The isolated, noindex preview route now displays responsive WebP derivatives at 480/960/1448px. Original aspect ratio and image dimensions reserve space. The image has high fetch priority; below-image data continues to use the existing API/hooks. No 3D engine, new dependency, collector or storage write was added.

## Current candidate: decision summary (supersedes earlier long layouts)

The latest owner feedback asks for a 15-second decision summary, preserving the approved image and existing detailed page. The top three links now show (1) the longest fresh comparable departure-hall wait with hall/terminal/time and ties, (2) the upcoming scheduled departure slot with the most flights, excluding elapsed departures even inside the current partial hour, and (3) the largest positive previous-month daily-mean destination change. Missing/zero-baseline comparisons do not produce invented summaries. Shared queue selection retains freshness, duplicate-conflict and closed-reading rules; a zero reading is not recommended as quiet. A 60+ reading retains its plus sign.

T1/concourse/T2 counts and west/centre/east shares remain HTML inside the image on desktop and mobile. Only T1/T2 receive actual hall observations; no concourse waiting time is created. Image width is capped at800px on desktop without cropping. The concise country shares and daily-mean change Top5 sit directly below it. They are separate measures: selected-day destination flight share versus monthly daily-mean percentage change. Unknown destinations retain the selected-day denominator. Top country ties remain included; the complete list is a link to existing detail, not a duplicated list. The long hourly chart and time controls have been removed from this preview only. Date and terminal controls remain.

## Current actual screens
- [PC1440](screenshots/airport-glance-overlay-20261012/glance-overlay-1440.png)
- [Mobile360](screenshots/airport-glance-overlay-20261012/glance-overlay-360.png)
- [Mobile390](screenshots/airport-glance-overlay-20261012/glance-overlay-390.png)
- [Mobile430](screenshots/airport-glance-overlay-20261012/glance-overlay-430.png)
- [Evidence](screenshots/airport-glance-overlay-20261012/capture-evidence.json)

These captures reuse the stored public API response and source clock 2026-10-12T06:43:09.299Z (15:43 KST), DPR1, reduced motion. Actual values: T2 hall1A24min at15:41 (tied); upcoming18:00–19:00 has36 scheduled flights; MP daily mean+50.0%, September30 versus October11 included days. Country shares show Japan165/563=29.3% and China133/563=23.6%. No screenshot numbers are hardcoded in production. Four captures have no horizontal overflow or page errors; pixels were inspected on PC/mobile.

The same source image remains 3,030,243bytes; responsive derivatives480/960/1448 remain57,294/199,386/364,242bytes. The current desktop selects960, mobile480 at DPR1. No new API, image generation, 3D engine or dependency. No whole-site PSI/LCP claim.

Targeted validation: typecheck PASS; scoped ESLint0 errors/one existing static-img advisory; glance decision/country5 + font2 PASS; unchanged UI-lock PASS; native build PASS; new decision-summary browser9 + missing-clock failure1 PASS (360/390/430/1440 overlay bounds/nonoverlap, terminal/date switching, no stale current waits on past dates, loading failure, four languages, keyboard details and destination links). The former long-layout tests were replaced to reflect the explicitly superseding design; UI-lock tests and approval hashes were not modified. Earlier full feature checks were not repeated.

Draft only: this is a revised candidate, not final approval. Existing detail is not shortened, and no merge/deployment was run. Library delivery is handled by the parent; no duplicate upload attempted. Earlier capture folders are retained as historical evidence, superseded by the links above.

Final review also verifies that a failed summary clock cannot label available flight records as “no upcoming departures”; that case is unavailable. Type/lint, the single added failure-path browser test and build passed after the guard. Normal-data captures above are unchanged.
