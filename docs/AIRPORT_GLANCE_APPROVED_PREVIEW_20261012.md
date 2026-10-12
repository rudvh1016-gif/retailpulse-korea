# Airport glance — approved artwork connected, publication still pending

The requested Library image `libfile_59815a4d20bc8191abc8b10d52ef2e49`, version1, was obtained through the user's existing Whale browser and the ordinary Library download route. The Windows transfer helper was not modified. The downloaded file is `exec-04566c4c-705b-4074-b17a-02d7175ae3a5.png`, 3,030,243 bytes, 1448x1086. Its SHA256 is `1c47eb2bb573444475ce911a606d353a9b7e7a7985f1be421a356558659a2b51`. Actual pixels were inspected before integration; the whole original composition is retained without cropping or regeneration.

The isolated, noindex preview route now displays responsive WebP derivatives at 480/960/1448px. Original aspect ratio and image dimensions reserve space. The image has high fetch priority; below-image data continues to use the existing API/hooks. No 3D engine, new dependency, collector or storage write was added.

## Actual screens

- [Desktop 1440px](screenshots/airport-glance-approved-20261012/glance-approved-1440.png)
- [Mobile 360px](screenshots/airport-glance-approved-20261012/glance-approved-360.png)
- [Mobile 390px](screenshots/airport-glance-approved-20261012/glance-approved-390.png)
- [Mobile 430px](screenshots/airport-glance-approved-20261012/glance-approved-430.png)

Captures use public API responses from 2026-10-12T06:43:09.299Z (15:43 KST), fixed to that source time. 563 scheduled physical departures and 33 at the selected current hour are actual API values, not hardcoded production data. The per-building totals, country means and source times remain HTML. Desktop retains the existing conceptual label arrangement; on mobile the three building readings move immediately below the full image so they cannot cover it. This is a conceptual layout, not official coordinates or a geometrically exact terminal map. The official map remains linked.

## Verification and size comparison

TypeScript, scoped ESLint (0 errors, the existing static-img advisory), two glance unit tests, two font-coverage tests, unchanged UI-lock, native vinext build and existing browser10 passed. Browser coverage includes 360/390/430/1440px, date/terminal/hour controls, unavailable and failed data, Chinese/Japanese, keyboard and reduced motion. All four fresh captures have no horizontal overflow or pageerror.

The same approved source image is 3,030,243 bytes before optimization. WebP files are 57,294 bytes at480px, 199,386 at960px and 364,242 at1448px. Cold browser contexts at DPR1 selected480px on all three mobile widths and1448px on desktop. This is an image-payload comparison; it is not a new whole-site PSI/LCP performance result.

## Revised preview after owner feedback

This is a revised preview, not final design approval. The approved artwork is unchanged. Only the unpublished glance route has a silver/blue-gray canvas; existing airport detail is unchanged. Mobile spacing is reduced, zero unverified-location notes are hidden, actual nonzero counts remain as small notes, and the conceptual-map disclaimer opens the unchanged denominator explanation with keyboard-accessible native details. The news entry matches the deployed Customs & Duty-Free News labels in all four languages and links to the existing page; no news tab is added.

The ranking now states actual included-day counts above the table (30 previous / 11 selected in this snapshot) alongside the daily-mean and excluded-comparison basis. Calculation functions, API contracts, source timestamps and image bytes are unchanged.

- [Revised desktop 1440px](screenshots/airport-glance-revised-20261012/glance-revised-1440.png)
- [Revised mobile 360px](screenshots/airport-glance-revised-20261012/glance-revised-360.png)
- [Revised mobile 390px](screenshots/airport-glance-revised-20261012/glance-revised-390.png)
- [Revised mobile 430px](screenshots/airport-glance-revised-20261012/glance-revised-430.png)
- [Capture evidence](screenshots/airport-glance-revised-20261012/capture-evidence.json)

The revised captures reuse the same saved public responses and fixed clock, at DPR1/reduced motion. Screenshot heights before/after: 1440 viewport 1722/1643px; 360 viewport 1792/1638px; 390 viewport 1815/1661px; 430 viewport 1845/1691px. These are layout measurements, not latency, LCP or PSI. All captures have zero horizontal overflow and page errors. Actual PC and mobile pixels were inspected. The parent has delivered the previous screenshots through Library; no duplicate upload or image generation was attempted for this revision.

Validation: `tsc --noEmit` PASS; scoped ESLint PASS with the same static-img advisory; `node --import tsx --test tests/airport-glance.test.ts tests/font-coverage.test.mjs` 4 PASS; `node --import tsx --test --test-name-pattern='UI|lock|protected' tests/operational-phase2.test.mjs` 3 PASS (including unchanged UI lock); native vinext build PASS; rendered HTML46 PASS; Playwright glance11 PASS. The first UI-lock invocation omitted the repository's tsx loader and failed before tests; rerunning with the required loader passed, without changing or disabling the lock. Git diff whitespace check PASS after LF normalization. Secret check and commit-specific CI are recorded on PR350.

No public merge, deployment, collection, schedule changes, paid services or protected-file changes. The owner reviews these revised screens before any publication decision.
