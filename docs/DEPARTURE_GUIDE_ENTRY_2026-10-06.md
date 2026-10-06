# Departure guide entry

The airport page's folded `출국 준비` summary did not explain the action clearly. Its entry now says `출국 준비 가이드` and `수속부터 탑승까지 보기`, beside a small existing white airport Blender illustration. After the owner found the first large card too tall, the entry became a compact text button: Korean mobile and desktop height is 82px, the illustration is 80 × 60px and desktop width is bounded at 420px. The text and illustration both activate the native summary, with a black button border, directional indicator and visible keyboard focus.

## Scope and provenance

- Separate branch `feat/departure-guide-cta-20261006`, based on main `565c0341cfd2cea1ff9d2eaccdd68283f7179701` after PR #280 merged. Initial inspection used `573251ed63f2f7194230678af849805dcd8ecbf5`; the newer main diff was inspected and incorporated without conflict.
- The entry summary of `app/airport-departure-preparation.tsx` changes, with entry copy and styles in separate files. Existing preparation steps, inputs, tax-refund guidance, sources and the merged travel-records link remain.
- Actual inspection confirmed that `공항 흐름` only jumped to `#airport-data-flow` on the same page. The owner-requested removal consolidates the old two-link shortcut row into the compact native preparation button. The terminal tablist, its target ID, context navigation and airport-information body remain. The unused old-row CSS and import are removed.
- Korean, English, Chinese and Japanese labels use the existing font families and body/weight tokens. The latest owner revision affects only the old shortcut row and its unused import in protected `app/retailpulse-app.tsx`; its one active hash is refreshed with an explicit bounded approval record. All other 52 protected hashes and the original lock test remain unchanged. No global CSS or font changes.
- Reuse `public/visuals/travel-records/v1/departure.webp` from main: 960 × 720, 25,566 bytes, SHA-256 `2e99e0d0920b1ae5b7abef26158d460295a4cd089332e559006ba6c11ae75164`. This is the existing Blender-rendered architectural concept, used decoratively; it is not an official building outline or wayfinding map. No new render or image generation was needed.
- No added image file, package or runtime service. The entry loads one existing static WebP. No collector, API, D1, scheduler, cloud configuration or paid-service change.
- This work does not incorporate the rejected PR #276 top switch or PR #278 guide-body redesign. Merge and deployment are owned by the parent integration task.

## Validation

Final latest-main implementation:

- Targeted ESLint and `tsc --noEmit`: pass.
- `vinext build`: pass, including the existing travel-records route. The existing large-chunk warning remains.
- New `e2e/departure-guide-entry.spec.ts`: 12/12 pass, four languages at 320px, 390px and 1280px. Verifies entry height 44–116px, bounded width, 80 × 60px thumbnail, bitmap decoding at 960 × 720, decorative-image accessibility, visible keyboard focus, Enter/Space/text/image activation, retained T2 selection, the existing localized travel-records link, removed redundant jump links, preserved airport tablist/context navigation, font coverage, no horizontal overflow and no page errors.
- Existing departure-preparation E2E switches only its obsolete shortcut-link focus to the native entry summary. One affected Korean 390px case verifies the updated entry followed by the unchanged preparation/refund flow; other unchanged cases are left for the required CI. Its first local run reached the final error assertion but reported icon CSP warnings because the local test used 127.0.0.1 while the server origin used localhost. Only the external local test configuration was aligned to localhost before repeating that single failed case; production security rules and test assertions were not weakened.
- Original active UI lock enforcement: 1/1 pass, covering all 53 protected hashes and unchanged cron locks. The first hash-update guard stopped because the old hash also appeared in a historical approval record; only the active file-hash entry was then updated, leaving historical approvals intact.
- Four affected rendered-HTML checks previously passed 4/4 (production shell, bounded four-language fonts, locale-aware font/weight choices and four-language product surfaces). These unchanged assertions were not repeated for the compact revision.
- Pixel inspection: actual compact mobile 390px and desktop 1280px screenshots inspected, with clear title/action and a loaded Blender thumbnail. The prior local images remain preserved; new screenshots replace the same two Library identities with a version guard.

Before the latest-main refresh, targeted font/passenger-guide/preparation unit checks passed 5/5 and the preparation-flow E2E passed 16/16 at 320/390/430/1280px in four languages. The compact revision repeats only affected entry checks and the one migrated flow case; the final new entry checks also verify the merged travel-records link. No full local suite was repeated.

Working-tree and reachable-history secret scan, protected-file comparison and `git diff --check` are required before push. The PR records the exact commit and its own CI status; local checks do not imply that remote CI, merge or deployment has completed.
