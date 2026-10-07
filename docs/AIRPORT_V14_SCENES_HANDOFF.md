# Airport v14 local scene connection

The approved v14 T1/T2 model frames and matching concourse now appear in the local airport views. Day and night use the same geometry, camera and crop. The desktop overview compares T1/T2 above the concourse; screens at 600px or narrower use a vertical comparison with DOM building names. The overview is a composition of independent Blender frames, not a geographic airport map.

The connection uses 30 WebP files (1,141,270 bytes total) with 390px, 900px and full-resolution variants. A native picture/source element and CSS switch layout and label anchors together. Existing Korea-time lighting boundaries, building navigation, accessible controls and flight data remain in use. Zone counts, gate ranges, shares and translations remain live DOM text below the image; the duplicate text overlays have been removed.

## Scope and baseline

- Local branch: `feat/airport-v14-scenes-20261006`.
- Fetched main baseline: `1b5fdd5b8ca1351d8fceb3ed71d4e5298a686bdd`.
- Owner authorization supplied by the lead: approved v14 T1/T2 plus matching concourse, followed by confirmed local day/night and overview connection.
- This is a new local v14 scope. PR267's blocked public merge was not retried. No remote PR, merge or deployment was performed; the lead owns public release.
- Protected UI files, UI Lock fixtures, work/visual-overview, provider code, schedules, data classification and dependencies were not edited.
- No paid runtime, new API request, database write, real-time 3D or video was added.

## Validation

- TypeScript no-emit: passed.
- ESLint on the changed TSX/E2E files: passed.
- Scene/zone unit tests plus operational phase-two/UI Lock checks: 49 passed.
- Existing focused browser tests: 18 passed across Korean, English, Chinese and Japanese at 390/1280px. Includes navigation/history, day-to-night switching, gate ties, physical-flight deduplication, country reconciliation and mobile fixed-navigation clearance.
- New `airport-v14-scenes.spec.ts`: passed. Day/night reflow at 390, 1280, 600, 601 and 430px keeps all three names readable, preserves the selected denominator and performs only one flight-data read.
- Actual local-site image inspection: 16 viewport/light/building combinations; zero page errors, label/aircraft intersections, label/label intersections, clipped aircraft or horizontal overflow. Aircraft bounds include wings, tail and engines from the saved-model projection contract. Screenshots use fixture data, not production measurements.
- Native `vinext build`: passed. The existing bundle pipeline reports a non-fatal chunk-size warning and incomplete static route classification; no release or production-capacity claim is made.
- Secret scan and `git diff --check`: passed.

## Asset provenance and limits

The images were rendered with Blender 5.2.1 LTS / Cycles CPU. Night changes lighting/world and restrained glass emission while retaining base material colors and geometry. The approved daytime originals are preserved separately. Night and new overview layouts remain review derivatives; no additional owner approval is asserted.

Official architectural material informed the simplified forms, but no measured official outline/BIM was obtained. Building appearance, stands and aircraft are concept modeling. Official gate data and KORETAIL east/west/central classification remain separate application data. Do not use these images for actual wayfinding or claim that the overview has geographic relationships or real-world scale.

## Handoff

The executor's separate `airport_v14_site_integration_v1` folder contains the local worktree, a Git patch/bundle, the connection QA script, measured browser results and screenshots. Day/night Blender and export source are preserved in `airport_detail_development_v14` and `airport_v14_night_layout_v1`. The lead should review the prepared code and use the normal release process for this authorized v14 scope, without reopening the blocked PR267 merge route.
