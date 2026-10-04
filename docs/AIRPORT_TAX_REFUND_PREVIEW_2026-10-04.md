# Separate passenger-guide preview

This work is deliberately separate from PR #254. No merge or deployment.
The owner authorized a compact passenger tax-refund section and subsequently
requested a rules-based international departure preparation guide. The local
first version is implemented with four transient selections, unknown fallback,
and conditional tasks. No choice is stored or sent. Other travel cases remain
with official guidance. No live wait or boarding-time guarantee is made.

Official guidance was read on 2026-10-04. Source publication/update dates were
not shown and remain null. Source URLs and check timestamps are in the dataset.
T2 has conflicting locations and counter hours on airport guide/facility/KTO
pages. The UI preserves all three sources in collapsed details, does not choose
a location pin, distinguishes kiosk registration from conditional customs
inspection and refund collection, and warns before checked-baggage handoff.
Carry-on inspection can be after security as directed by customs. Kiosk 24-hour
guidance does not assert customs staffing.

Blender v2 raster assets are versioned independently under public/tax-refund/v2;
prepare, registration, conditional inspection and refund assets are correctly
matched to HTML. They explain procedure rather than official airport positions.
They are local preview assets (four WebPs, 70,912 bytes). Original v1 assets and
their Git history remain. No 3D engine/API added.

Local focused browser tests: 32 passed, 4 languages × 360/390/430/1280 widths,
including keyboard opening, baggage change, before/after security, source
conflicts, terminal switching, glyph raster check, overflow and page errors.
plus chosen/absent/unknown tasks and correct concourse relation. The pure rule
test covers all 108 route/baggage/refund/pickup combinations. Rendered HTML
42 tests and build pass. Exact-head full CI is recorded in the separate draft PR.

## Rules and source boundaries

Airport departure procedure: https://www.airport.kr/ap_en/1413/subview.do
Duty-free facilities: https://www.airport.kr/ap_en/1531/subview.do
Customs and refund sources are retained in lib/airport-tax-refund-guide.ts.
All checked on 2026-10-04; source update dates not shown remain null.
The order's pickup counter/documents take priority; retail store locations are
not pickup counter assumptions. Main-terminal pickup is before concourse travel,
concourse pickup after travel. This guide does not invent a counter, queue or
available boarding duration. A checked bag is not evidence that refund goods
are packed in that bag. Carry-on inspection follows the place/time customs
designates, potentially after security; it is not forced before bag drop.

Existing airport flow remains the airport-first default. The two purpose links
open the compact passenger guide or jump to existing flow; selectors/data/API
calculations remain independent. Unknown routes produce official verification
instead of an inferred T2↔concourse departure route.

## Separate deployment block

PR254 is not part of this passenger release. Its approved merge was rejected
again even after the exact later question/answer was forwarded; no workaround
or additional attempt is authorized. This branch has never been deployed.
