# Passenger guide: Blender integration and evidence

Base: `87e22c4d3aa16da3cfc734dd6a3a2ade2872d46c` (fresh origin/main).
Independent branch: `feat/passenger-guide-blender`. This change reuses the
existing departure preparation, 108-combination rule engine and tax refund guide.
PR266/267/268, top-level audience rearrangement, terminal tabs and their tests
are outside this change.
The branch was subsequently synchronized with current main
`80e057eff336dabbe792f550db1aedf685d17936` after another workflow merged PR268.
Its mobile controls and exact terminal-label tests are preserved unchanged;
PR269's diff against that current main still contains only the 24 passenger
guide/evidence/test files.

The existing entry now explains its five-step contents. Basic departure has
five short HTML titles and one sentence each, with native details for additional
guidance. The selected-task order starts collapsed. Tax refund remains opt-in;
ordinary Korean residents are generally ineligible, with the official customs
eligibility link available for overseas-resident exceptions. No checklist or
screen action claims procedure completion. Existing black text, body size,
font assets, airport data and gate collapse behavior are retained.

## Assets

Seven optimized 128×128 transparent WebPs in `public/passenger-guide/v1` total
37,496 bytes. Their SHA256 values match the materialized Library ZIP.
Library ZIP, contract and 390px preview were materialized on this Windows
computer and their image pixels inspected; no cloud workspace path was used.
Library identities: `libfile_5fa5f91dc810819199c91c96354936dd`,
`libfile_cb4b6481e47c81919de923c4ab437ef6`,
`libfile_7c8c7608ee788191b47dec044c747d85`.

The approved seven actual `.blend` sources are retained in
`assets/passenger-guide-v1-blender.zip`; the sanitized contract and local
Blender 5.2.1 verification are beside it. All seven scenes opened successfully,
with real meshes, active cameras and 512px render settings. The deployment
ships WebP only, without a 3D engine. Preparation and conditional customs keep
their existing dedicated Blender v2 images; the new registration and collection
images correctly match their HTML steps. Terminal T1/T2 labels use the contract's
normalized anchors, in HTML; raster files contain no text/QR/personal data.

## Official evidence checked 2026-10-04 UTC

Publication/update dates were not shown and remain unknown. These are guidance
snapshots, not live operating hours, queues or guaranteed routing.

- [Airport tax-refund procedure](https://www.airport.kr/ap_ko/898/subview.do):
  distinguishes cabin goods from checked goods. Airline tagging and returning
  the bag for kiosk/inspection checks is explicitly described. Kiosk selection
  precedes any required customs inspection and final baggage handoff. Retained
  short original excerpt: “수하물에 텍을 부착하여 다시 돌려받은 후”.
- [Incheon Airport Customs](https://customs.go.kr/incheon_airport/cm/cntnts/cntntsView.do?cntntsId=6688&mi=12547):
  eligibility is nonresident status, including specified overseas Korean cases;
  ordinary domestic residents are not inferred eligible. Passport, refund sales
  confirmation and goods are needed. Original excerpt: “반드시 짐 부치기 전에”.
- [Airport facilities, Korean](https://www.airport.kr/ap_ko/1008/subview.do)
  was reopened, but the accessible initial list did not expose refund entries.
  The linked [English facility directory](https://www.airport.kr/ap_en/1546/subview.do)
  was also reopened: T2 F/G registration and 249/270 refund positions; T1 B/D/J/L
  and gate 28; concourse center on 3F. Original excerpt: “Center of 3F, Concourse”.
- [Departure procedure](https://www.airport.kr/ap_en/1413/subview.do):
  security, immigration, gate and boarding order; no return to public area after
  immigration, and no return from concourse after shuttle train travel.
  Original excerpt: “return is not allowed”.
- [KTO refund guide](https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=489&vcontsId=248765)
  was reopened to preserve source-specific T2 225/249/274 and 07:30–21:30
  claims. Original excerpt: “Near Gates 225, 249, and 274”.

T2 airport procedure lists across 250/near 253 and 07:00–21:30, conflicting
with the directory and KTO; those facts remain source-specific, collapsed.
No precise route or currently-open label is chosen. T1 gate 28 is consistent;
the 07:00–22:00 staffed-counter claim remains in the source record but is not
shown as a guaranteed current schedule. Kiosk 24h must never imply customs
staff hours. The reported competing T1 24h staffed claim was not independently
recovered from the initial Korean facility list; the UI conservatively asks
travelers to confirm rather than resolving that uncertainty.

## Validation and audit scope

Focused browser suite: 35 passed after final collapse behavior, four languages,
320/390/430/1280px, keyboard details, repeated selections, terminal changes,
optional eligibility, external official link values, loaded 128px dimensions,
transparent and visible pixels for all seven new images, no horizontal overflow.
Existing calendar/zone/passenger integration E2E: 16/16 passed, four languages
at 360/390/430/1280px, with its image assertion updated for the actual 2+2 assets.
After synchronization with main `80e057e`: all 1,145 unit tests, typecheck,
build and 42 rendered-HTML tests passed again. The combined related browser
suite, including the unchanged PR268 mobile-controls tests, passed 57/57.
Actual rapid double-clicks were also verified at 320px to keep exactly one
guide body and one selected refund phase.
Screenshots are saved in `test-results/passenger-guide-{320,390,430}.png` and
the standard CI artifact includes them. English fallback and asset byte contract
unit tests pass. Typecheck, lint (warnings only) and verified build pass.

The first complete Windows unit run had 1,141/1,143 passes and two failures caused
by Git CRLF conversion in byte-hash and newline-sensitive workflow assertions.
Working-copy locked text was normalized to the original LF without repository
content changes; original font/image binaries were retained. Final complete unit
run: 1,145/1,145 passed. Rendered HTML: 42/42 passed. Full working-tree/reachable
Git-history secret scan passed. Operational health exited successfully; unknown
runtime enablement remains unknown. Linux CI and release status are recorded in
the PR.

Applicable zero-cost audit: static same-origin assets, no runtime package, API,
database, scheduler, account, paid service or personal-data input added. No new
collector/forecast/retention architecture is involved. No traffic-capacity or
free-tier safety claim is made. UI reviewed against the vendored and refreshed
Web Interface Guidelines: native semantics, focus outlines, decorative alt,
explicit dimensions, lazy images and static reduced-motion-compatible content.

Release requires the PR's complete CI, repository merge authorization, current
main verification, production deployment and post-deployment verification.
Passing local tests is not evidence that the public site has been updated.
