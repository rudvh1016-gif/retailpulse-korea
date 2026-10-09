# Seoul flow models and two owner-requested UI corrections — 2026-10-09

Base: `71b88933866222e5ba4f3e491a2feca8ce982319` (user-merged PR320). This branch is a review bundle; it does not merge, deploy, collect providers, change schedules, or alter protected approval hashes.

## Requested screen corrections

- The final odd category card keeps its full-width row but sizes the category-name column to its content. The share follows with the existing 6px mobile / 8px desktop gap. Two half-width cards keep their existing stacked name/share layout. Counts, ratios, denominators, fonts and type sizes are unchanged.
- Remove the owner's exact arrival explanatory sentence and equivalent translations. Use the clearer `시간대별 예상 입국객` heading in four languages; retain the official forecast meaning, data and collection timestamp. The corresponding existing typography assertion is updated to assert absence of the removed sentence and presence of the original 09:05 collection time, without weakening passenger or terminal checks.

## Blender assets and connection code

Three procedurally generated concept models: station movement, living population, tourism-purpose movement. White/sky-blue palette with small mint accents. Geometry never encodes numbers, nationality, real station coordinates or observed paths. Numeric values stay in HTML.

- `app/seoul-flow-models.tsx` accepts the caller's existing summary and selected district/language. It adds no fetch. It preserves daily subway ridership, hourly living population and official batch-file mobility as separate measures with their own source/date/retrieval time. Original tourism unit remains unverified; publication month is separate optional metadata.
- `lib/seoul-flow-data.mjs` adapts existing `/api/live/summary` data. Its optional reader uses the same-origin existing API only. Missing/invalid/failed data never falls back to review values; zero stays zero.
- Nine responsive WebP files: three sizes per model. Three 640px images total 36,528 bytes; three 960px images total 59,160 bytes; three 1440px images total 97,038 bytes. These are alternative variants, not nine simultaneous requests. Images reserve 8:5 space and load lazily in the component; no browser 3D engine.
- `public/previews/seoul-flow/index.html` is an explicitly captured review page, not a live production metric view. It uses existing site fonts and the three public WebP models. Minimal public snapshot captured from the existing summary API at 2026-10-09 09:34 KST: Itaewon daily alighting 12,037 / boarding 11,392 (2026-10-07); living-population estimate 960.57 (2026-08-26 23:00 KST); tourism value 346.5 (API reference date 2026-09-30, independent official release month 2026-09, original unit unverified).
- Master `.blend` files and PNG/ZIP metadata containing local paths remain in the private local deliverable. Only metadata-free WebP and browser screenshots are published. The portable procedural generator is included for review.

## Actual verification

- New adapter and existing composition units: 6 passed.
- Native Worker build, TypeScript, lint and complete working-tree/reachable-history secret scan: passed.
- Requested UI checks: four languages × 360/390/430/1280, keyboard and reduced motion, stable ratios and adjacent share, preserved half cards, source timestamp and console inspection. All sixteen passed; existing arrival-screen regression also checked separately. The category screenshot uses a deterministic test fixture, not a current production snapshot.
- Public preview paths: HTTP200, all three image decodes and four languages passed; screenshots at 390/1280. The previous private preview's sixteen cases are not rerun solely for reporting.

## Exact remaining blocks

The original Owner UI Lock actually fails on `app/live-signals.tsx` only, because the newly requested sentence/title correction changes its bytes. Expected hash: `75888c628f76c15fe6a0c71501742aa74462d5541cb5d2b113e6a9816e82c2a4`; candidate: `760c26016bf2038ed322658381dfac1bec726d5d5acab7094c4a558d56962610`. `tests/fixtures/phase2-locks.json`, original enforcement test, all 61 protected members and schedules remain unchanged. No baseline update or approval retry is attempted.

The actual Seoul movement mount is also in protected `app/live-signals.tsx`. This bundle prepares the component, assets and review page but intentionally does not add that separate mount. Existing Seoul sections are therefore not yet connected to the new models. The source edit here is strictly the owner's new arrival sentence/title request.

The Seongsu historical-day source fix remains separately held at commit `2c641b7326375c1c191b850a12ff4d42484c28c2` / issue321; no Seongsu baseline action occurs here. Prior PR317/319 baseline refusals are not retried. Normal approval must be resolved before any applicable baseline change; final Merge stays with the user.

Library save for the local Blender bundle failed because supported `prepare_uploads` is unavailable in this execution environment. This is a capability absence, distinct from the reference materialization's HTTP403. No new Library IDs were created and no alternative Library upload was attempted.
## Actual public release observation and additional correction

PR320 main CI37869546572 completed successfully with 993 E2E passes. Automatic Cloudflare deploy37872508085 also succeeded for exact main71b88933866222e5ba4f3e491a2feca8ce982319. No manual deployment or recollection occurred. A readonly public observation at about 11:05 KST showed all/T1/T2 HTTP200, distinct correct scope headings, model source date2026-10-09 and last changed retrieval10:09 KST, no overflow or console errors. The all model denominator was590; T1's own passenger reference retained313 flights (168 main +145 concourse), and T2 retained277. Current enrichment has confirmed the formerly unknown T2 gate, so both terminal reference rows now legitimately read READY; withholding on unknown locations remains covered by the earlier regression suite.

That public observation also caught a real remaining T1 defect: API zones are canonical DG3_W etc., while the new color helper matched display aliases3W only. Public fresh T1 rows therefore still appeared neutral. This review branch corrects the unprotected helper to accept canonical DG[2-5]_[EW] alongside the existing display aliases. The approved2–5/E/W range, thresholds, raw-minute validation, zero, stale/future/error/closed handling, waiting-count independence and T2 behavior remain unchanged. No new source, policy, provider request or protected baseline change is introduced. This correction is NOT yet deployed.

Relevant canonical-ID verification: queue units12 PASS; browser360/390/430/1280 four PASS; TypeScript/lint/Worker build PASS. Reuse the completed full-history secret scan and check the current working tree against the original scanner's exact patterns: PASS. No reporting-only broad test rerun. The initial draft CI caught an unsupported Korean syllable in the new component as well as the expected Owner UI Lock failure. The copy was reworded using the existing font subset, without changing any font asset; font coverage2 PASS. Latest-head automatic CI state is recorded in the PR after push.
