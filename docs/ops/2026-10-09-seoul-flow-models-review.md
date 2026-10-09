# Seoul flow models and requested UI corrections - 2026-10-09

Base: `71b88933866222e5ba4f3e491a2feca8ce982319`, the owner-merged PR320.
The original PR322 review bundle is now consolidated into draft PR323 with
the specifically approved retained-day fix and Seoul model mount. No agent
merge, deployment, provider collection or schedule change is performed.

## Requested behavior

The final odd category card retains its full-width row and sizes the category
name column to its content. Its share follows with the existing 6px mobile /
8px desktop gap. Two half-width cards keep their stacked name/share layout.
Counts, ratios, denominators, fonts and type sizes are preserved.

The owner's arrival explanatory sentence and its translations are removed.
The four-language heading now identifies expected arrivals by time. Official
forecast meaning, passenger/terminal checks and collection time remain. The
existing typography assertion checks the requested sentence's absence and
retains its original 09:05 source-time assertion.

## Blender models and live summary connection

Three procedural concept models show station movement, living population and
tourism-purpose movement, using white/sky blue with small mint accents.
Geometry does not encode numbers, nationality, real coordinates or observed
paths. Values remain in HTML with each measure's source, period and unit.

`app/seoul-flow-models.tsx` receives the existing caller summary and selected
district/language. The approved mount in `app/live-signals.tsx` now connects
all four districts without another fetch. Daily subway ridership, hourly
living population and official batch-file mobility remain separate measures.
The original tourism unit is unverified; publication month is separate optional
metadata. Missing, invalid and failed data do not fall back to review values;
zero is preserved.

Nine responsive WebP variants reserve 8:5 space and load lazily. The three
640px variants total 36,528 bytes; 960px total 59,160; 1440px total 97,038.
These are alternate sizes rather than nine simultaneous requests. No browser
3D engine, new font or dependency is added.

`public/previews/seoul-flow/index.html` is a captured review page, identified
as such. Its minimal snapshot was captured from the existing summary API at
2026-10-09 09:34 KST: Itaewon alighting 12,037 / boarding 11,392 for October 7,
living-population estimate 960.57 for August 26 at 23:00 KST, tourism value
346.5 with API reference date September 30 and independent release month
September 2026. The tourism unit remains unverified.

Master Blender files and metadata containing local paths remain private.
Public files are metadata-free WebP/browser screenshots and the portable
procedural generator. The separately prepared old Blender Library bundle
could not use `prepare_uploads` in that earlier environment; this does not
describe the subsequently successful individual METAR screenshot save.

## Specific approval and original protection

The original PR322 head's Owner UI Lock failed because the new arrival copy
changed `app/live-signals.tsx`. It was not bypassed. The owner subsequently
answered the concrete retained-day / arrival-copy / Seoul-mount approval
question on 2026-10-09. The evidence and exact scope are recorded in
`../approvals/requested-integration-20261009.json`.

The normal approval update was accepted in PR323's worktree. Only the hashes
for `app/api/live/summary/route.ts` and `app/live-signals.tsx` changed. All61
protected members, other59 hashes, historical approval records, cron values
and the original enforcement assertion are preserved. The original lock test
passed. Prior unrelated PR317/319 rejections are not retried or included.

The retained past-day fix from commit `2c641b7` / issue321 is included here.
It reads the selected retained KST interval; today's six-hour/73-point query
and future/missing-day behavior remain. No backfill or provider recollection
is performed.

## Canonical T1 checkpoint correction

Readonly observation of the owner-released main71b at approximately 11:05 KST
found fresh T1 API IDs such as `DG3_W` displayed with a neutral color because
the helper accepted only display aliases such as `3W`. The unprotected helper
now accepts canonical `DG[2-5]_[EW]` as well. Existing ranges, thresholds,
raw-minute validation, zero, stale/future/error/closed states, independent
waiting counts and T2 behavior are preserved. This candidate is not deployed.

The same readonly observation showed all/T1/T2 HTTP200 with no overflow or
console errors. All-model denominator was590; T1 retained313 flights
(168 main +145 concourse), T2 retained277. Current enrichment had resolved the
previously unknown T2 gate. Withholding unknown locations remains tested.
The owner-triggered PR320 CI37869546572 and automatic deployment37872508085
were successful; no agent deployment or recollection occurred.

## Completed verification

Reuse the earlier completed checks: adapter/composition6 passes; canonical
queue12 units and4 browser widths; four-language requested UI16 browser
cases plus the existing arrival regression; preview HTTP200 / three image
decodes / four languages; typecheck, lint, native Worker build and secret scan.
The missing Korean glyph found by the earlier CI was reworded using the
existing font subset; font coverage2 passes, with no font asset edit.

PR323's additional approved mount is covered at all four district routes with
four languages and 360/390/430/1280 widths. Exact final consolidated head and
full automatic CI results belong to PR323. Old PR322 CI failure remains a
historical result, not a claim about the consolidated candidate.

Public release remains owner-controlled. The specific UI approval does not
authorize METAR requests, operational writes, source activation or deployment.