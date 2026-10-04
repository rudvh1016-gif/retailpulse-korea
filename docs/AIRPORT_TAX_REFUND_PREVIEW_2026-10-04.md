# Separate passenger-guide preview

This work is deliberately separate from PR #254. No merge or deployment.
The owner authorized a compact passenger tax-refund section and subsequently
requested a rules-based international departure preparation guide. The latter
is not yet implemented; no claim of completion.

Official guidance was read on 2026-10-04. Source publication/update dates were
not shown and remain null. Source URLs and check timestamps are in the dataset.
T2 has conflicting locations and counter hours on airport guide/facility/KTO
pages. The UI preserves all three sources in collapsed details, does not choose
a location pin, distinguishes kiosk registration from conditional customs
inspection and refund collection, and warns before checked-baggage handoff.
Carry-on inspection can be after security as directed by customs. Kiosk 24-hour
guidance does not assert customs staffing.

Blender v1 raster assets are versioned independently under public/tax-refund/v1;
prepare, registration, conditional inspection and refund assets are correctly
matched to HTML. They explain procedure rather than official airport positions.
They are local preview assets pending the producer's v2. No 3D engine/API added.

Local focused browser tests: 16 passed, 4 languages × 360/390/430/1280 widths,
including keyboard opening, baggage change, before/after security, source
conflicts, terminal switching, glyph raster check, overflow and page errors.
These are not a full final CI or passenger-rule completion claim.
