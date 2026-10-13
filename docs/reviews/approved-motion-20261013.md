# Approved choice feedback — 2026-10-13

Base: `9a1364227d1bdb3c86334f36150bd901ccce3063`. Owner request: `Sentinel_f20afc71e90081919c6865558a117978` explicitly approves all six effects. Branch: `codex/approved-motion-20261013`. No merge or deployment in this task.

## Result

1. Airport scope: selected thin rule and selected building name respond for 180 ms. Airport image, building panels, counts and layout remain fixed.
2. Seoul population: only the selection marker translates for 160 ms on button/select changes. Pointer drag cancels motion and commits immediately. The observed/forecast bounds, sample gaps, units and reading values do not animate.
3. Store preparation: compare instruction text by fact/rule identity after place, industry or opening-hour choices. Only changed visible items respond for 180 ms. Clipboard success alone reveals a small check; failures and pending requests do not. Repeated requests ignore superseded results.
4. Airport 1/3/6 hours: zone and destination result groups respond together for 220 ms. Existing numbers, time ranges, ties and unavailable states are computed and rendered immediately.
5. Monthly consumption: only paired bar groups respond for 200 ms after confirmed district/month data arrives. No zero-growth animation or animated re-ranking; unavailable values remain absent.
6. Departure preparation: a localized “순서 보기” button connects four core icons once in 2.4 seconds. Core steps come from the existing plan, including `CHECK_IN_TAX`. The adjacent DOM summary retains every conditional customs, bag, pickup and refund instruction. The effect does not mark anything complete.

Short responses use native finite animations with `transform`/`opacity` and the shared `lib/motion.ts` reduced-motion preference. The departure sequence uses the existing lazy GSAP loader. Hidden pages, offscreen elements, changed selections and unmounts cancel active effects. Reduced motion keeps the final static state. No dependency, provider, collector, API, D1, paid-runtime or schedule change.

## Verification

- TypeScript: pass.
- Secret scan: complete working tree and all 1,197 reachable commits passed. The partial-clone scan required read-only GitHub access; no pattern or history check was skipped.
- Scoped ESLint: no errors; two existing image-element warnings in airport glance.
- Production `vinext build`: pass.
- Relevant unit/contracts/UI lock: 87 passed across airport glance, 108 departure-input combinations, business prep, sharing, visual foundation and operational phase 2.
- Rendered HTML: 44 passed initially; four travel-record tests initially used a different site-origin environment from the build. Those four passed with `NEXT_PUBLIC_SITE_ORIGIN=https://koretail.co.kr`, matching the artifact. No assertion or product code changed for that environment mismatch.
- Focused Playwright: seven scenarios passed, including 320/390/1280 px, measured animation durations, repeated choices, keyboard selection, immediate pointer drag, unchanged bounds, copy pending/failure/success, reduced motion and Back navigation. A taller test viewport keeps the preparation form and changed instruction visible together for a positive 180 ms assertion; the offscreen guard correctly skipped it while outside the viewport. The population fixture was corrected from array indexing to its actual keyed area shape before its passing run.
- Additional capture check: conditional customs retained, `CHECK_IN_TAX` preserved, route changes remove/cancel playback, unchanged summary text and exact bounding box before/after playback, no browser errors.
- Source review: existing font/weight/spacing tokens retained; no added blur, loop, canvas text, count-up, chart curve or image scaling. Reviewed against vendored design skills and current Vercel web-interface guidelines.

Evidence is fixture-backed local browser validation, not live-provider or production verification. Captures are in `docs/screenshots/approved-motion-20261013/`; `selection-and-departure.webm` demonstrates the motion, and `capture-evidence.json` records the capture conditions. `scripts/capture-approved-motion.ts` reproduces the visual evidence against the local preview at port 4196. `e2e/approved-choice-motion.spec.ts` is the maintainable regression suite.

Only protected `app/population-flow.tsx` is updated in the lock manifest, with previous/final SHA-256 and exact diff in `docs/approvals/approved-motion-20261013.json`. The protected file list and enforcement remain intact.

## Consolidation

Parent PR360 (`fcf5b9ba`) is now a normally merged dependency of this draft. The CSS tail conflict was resolved by preserving both the time-label rule and all four motion rules. The TSX merged automatically; the focused motion test reads the new dedicated time label. Parent share-document changes are in `lib/prep-share.ts`, separate from this branch’s `app/prep-share.tsx` success indicator. Claude collection/loading/image work is outside this branch. Required full CI must pass on the consolidated commit before any merge or deployment.

## Clipboard follow-up

Parent review identified a pending-copy/document-change race. A browser regression reproduced it on the same mounted sharing component: change industry while the clipboard promise is pending, then resolve the old promise; the previous version incorrectly showed `copied`. The fix invalidates pending attempts in layout cleanup keyed by serialized document text, and resets status/fallback when that text changes. The new regression and existing copy pending/failure/success scenario both pass. No clipboard completion is attributed to a different document.
