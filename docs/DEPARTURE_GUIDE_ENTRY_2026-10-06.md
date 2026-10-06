# Departure guide entry

The airport page's folded `출국 준비` summary did not explain the action clearly. Its entry now says `출국 준비 가이드` and `수속부터 탑승까지 보기`, beside the existing white airport Blender illustration. The whole summary, including the illustration, opens the preparation guide. An underlined action, directional indicator and visible keyboard focus make the action apparent.

## Scope and provenance

- Separate branch `feat/departure-guide-cta-20261006`, based on main `565c0341cfd2cea1ff9d2eaccdd68283f7179701` after PR #280 merged. Initial inspection used `573251ed63f2f7194230678af849805dcd8ecbf5`; the newer main diff was inspected and incorporated without conflict.
- Only the entry summary of `app/airport-departure-preparation.tsx` changes. Entry copy and styles are separate files. Existing preparation steps, inputs, tax-refund guidance, sources and the merged travel-records link remain.
- Korean, English, Chinese and Japanese labels use the existing font families and typography tokens. No global CSS or protected UI file changes. The current lock lists 53 protected files; none is changed by this branch.
- Reuse `public/visuals/travel-records/v1/departure.webp` from main: 960 × 720, 25,566 bytes, SHA-256 `2e99e0d0920b1ae5b7abef26158d460295a4cd089332e559006ba6c11ae75164`. This is the existing Blender-rendered architectural concept, used decoratively; it is not an official building outline or wayfinding map. No new render or image generation was needed.
- No added image file, package or runtime service. The entry loads one existing static WebP. No collector, API, D1, scheduler, cloud configuration or paid-service change.
- This work does not incorporate the rejected PR #276 top switch or PR #278 guide-body redesign. Merge and deployment are owned by the parent integration task.

## Validation

Final latest-main implementation:

- Targeted ESLint and `tsc --noEmit`: pass.
- `vinext build`: pass, including the existing travel-records route. The existing large-chunk warning remains.
- New `e2e/departure-guide-entry.spec.ts`: 8/8 pass, four languages at 390px and 1280px. Verifies bitmap decoding at 960 × 720, decorative-image accessibility, visible keyboard focus, Enter/Space/image activation, retained T2 selection, the existing localized travel-records link, font coverage, no horizontal overflow and no page errors.
- Four affected rendered-HTML checks: 4/4 pass (production shell, bounded four-language fonts, locale-aware font/weight choices and four-language product surfaces).
- Pixel inspection: actual mobile 390px and desktop 1280px screenshots inspected, with clear title/action and a loaded Blender image. Screenshots are preserved separately and saved to the user's Library.

Before the latest-main refresh, targeted font/passenger-guide/preparation unit checks passed 5/5 and the unchanged preparation-flow E2E passed 16/16 at 320/390/430/1280px in four languages. These unaffected checks were not repeated; the final new entry checks above also verify the newly merged travel-records link. No full local suite was repeated.

Working-tree and reachable-history secret scan, protected-file comparison and `git diff --check` are required before push. The PR records the exact commit and its own CI status; local checks do not imply that remote CI, merge or deployment has completed.
