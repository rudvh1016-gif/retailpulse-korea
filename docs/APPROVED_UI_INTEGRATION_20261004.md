# Approved KORETAIL UI integration — 2026-10-04

The final integration branch starts from combined review `f91f35353c138e979610b25200aa2c2041c8a709`, with main `75d8121e975f92d9ab8f06b02e5459f6ae8ace90` verified as an ancestor. It includes the preserved calendar, passenger preparation, gates/countries and mobile navigation work from the earlier review branches. The owner subsequently approved normal baseline bookkeeping, final integration, merge and release.

## Resulting behavior

- Airport models restore the original v5 broad curved terminal and curtain-glass geometry. V7's repeated warehouse-like roofs remain historical assets and are no longer selected. V8 changes restrained sky/white/mint materials and aircraft trim while preserving geometry, camera, crop and conceptual label coordinates. Day/night remains independent of data freshness. Models are conceptual building comparisons, never official geography.
- Each selected building/lighting requests one responsive WebP (480, 900 or original width); image boxes reserve the source aspect ratio. No 3D runtime or additional provider requests are added. The architectural model remains visible when flight records fail, with no invented counts or shares.
- Airport hourly figures retain the original 24-hour axes, exact API-derived heights, lower terminal layer, peak/current markers and all pointer/keyboard controls. Only faces, caps, sides and small inner edge highlights change. Zero bands receive no invented volume.
- Consumption initially shows every provider category with its original miniature, short name and payment share. There is no fixed category limit, merged “Other” slice or frozen production number. Missing/duplicate classifications withhold full shares. Exact source names, payment values, amount bounds, activity grades and both detail metrics remain available. Weather observations and source freshness logic remain separate and unchanged.
- Seoul leads with the latest valid observed population range, provider crowding label, observation age and source collection time. A small official forecast-only range plot and every published future-hour button support the main reading. Full observation/forecast history, original scrubber, bounds, gaps, source times and exact-value table remain accessible. Forecasts never connect across missing intervals or differing issues.

## Protection and validation

The owner explicitly authorized normal SHA-256 bookkeeping for `app/operational-context.tsx`, `app/live-signals.tsx`, `app/area-demand-card.tsx` and `app/globals.css`. Automatic review accepted the concrete update. `tests/fixtures/phase2-locks.json` records the original and approved hashes under `ownerFinalApprovedUi20261004`. The protected-file list, Cron values, historical approvals and enforcement test remain unchanged.

Local validation: lint (0 errors; 3 existing explicit image warnings), typecheck, verified bounded build, 1,143 unit tests including active Owner UI Lock, and 42 rendered-HTML tests. Relevant browser checks cover all four locales, 360/390/430/1280 widths, every source category, amount and zero/missing states, refresh/initial failures, airport ties/search/full lists, terminal/date switches, source ranges, history and keyboard controls. The final PR records full browser-suite and exact-head CI results before merge.

## Controlled public baseline

Read-only measurements taken before this integration: Chromium, 390×844, device scale 1, cold browser cache, CPU 4×, 150 ms RTT, 1.6 Mbps download / 750 Kbps upload, three fresh contexts per route, sampled 10 seconds after DOMContentLoaded.

Airport `/ko/airport`: LCP median **2.228 s**, CLS median **0.0519**, no page errors or horizontal overflow. These are observed browser metrics, not a Lighthouse score. Long-task excess is not labeled Lighthouse TBT. Current source responses and edge-cache conditions can affect the outcome; the same protocol must be run after release and reported with all three samples.

Original API, collector, forecast, source semantics, database schema, schedules and billing settings are outside this UI change. Release uses the existing successful-main-CI deployment workflow without forcing checks or bypassing environment review.
