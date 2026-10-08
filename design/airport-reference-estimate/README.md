# Data-free Blender reference pillar

Generated with the installed Blender5.2.1LTS; authoring only. `render_reference_pillar.py` produces a transparent unit-pillar render and editable `.blend`. `prepare_pillar_sprites.py` slices its complete cap/wall/base into the three lossless WebP files in `public/airport/reference-estimate/`. Pillow is an offline authoring dependency already available on the author's machine; it is not added to the app or CI.

No flight count, passenger count or exchange rate is baked into this model. Runtime heights come from the existing reconciled flight-proportion estimate via `lib/airport-reference-pillars.ts`; HTML labels retain the existing rounding and truth qualifications. The airport v14/D geometry is not replaced.

Reproduce locally with Blender's background CLI using `--python render_reference_pillar.py -- <output-directory>`, then `python prepare_pillar_sprites.py <output-directory>/reference-pillar-unit.png <repo>/public/airport/reference-estimate`.

Latest IMG_0967 Library metadata and OCR were available, but supported original-byte materialization returned403. This is not a claim of inspecting those original pixels; actual native-browser pixels of main and the new implementation are the visual evidence.
