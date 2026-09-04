# Local font asset provenance

The files under `public/fonts/` are static web assets and are not part of the
Worker JavaScript bundle. They are covered by the SIL Open Font License 1.1
texts in this directory.

## Pretendard

- Release: Pretendard 1.3.9
- Source TTF: `https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/public/variable/PretendardVariable.ttf`
- Source TTF SHA-256: `3090ccde0442bb347aa7685d9ba8b17436a60682df6e8f92a9a670de14056e22`
- Official full WOFF2: `https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2`
- Official full WOFF2 SHA-256: `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4`

`pretendard-variable.woff2` is that exact unmodified official WOFF2. It is
loaded only for changeable official Korean event text and carries all modern
Hangul syllables.

`koretail-sans-variable.woff2` is a FontTools/Brotli subset generated from the
same TTF and every text-bearing `.ts`, `.tsx`, `.css`, `.mjs`, and `.json`
source under `app/` and `lib/`, plus the product's shared punctuation ranges.
The corpus also includes every short-form `Intl.DisplayNames` region label
reachable from the checked-in airline registry and a read-only snapshot of the
public Production facility/live-summary text (1,221 facility rows, retrieved
2026-09-04 UTC). Provider-owned Korean strings use the complete upstream face
first; the subset and CJK faces provide the mixed-script fallback used by the
official records.
Because Pretendard is a Reserved Font Name under its OFL, every font-family,
full-name, PostScript-name, variation-prefix, and named-instance record in the
modified font is renamed to `KORETAIL Sans`; copyright, trademark, attribution,
version, and license records remain unchanged.

## Noto Sans CJK

- Release: Noto Sans CJK 2.004 (`Sans2.004`)
- SC source: `https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf`
- SC source SHA-256: `d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964`
- JP source: `https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/Variable/TTF/Subset/NotoSansJP-VF.ttf`
- JP source SHA-256: `f4b373b226668ee33a6e54b02823dcd2d1209f17159f777421ae8c2275160369`

The 400 and 600 files are static instances made from those pinned variable
sources, then subset with FontTools/Brotli against the complete product-copy
corpus, all 179 airline-registry region labels generated with explicit
`{ type: "region", style: "short", fallback: "code" }`, the same public
Production facility/live-summary snapshot, and shared punctuation ranges.
Both weights use the same locale corpus because Airport airline metadata uses
weight 400 while registered-country rows use weight 600. The exact 2.004
license is retained as `NOTO-CJK-OFL-1.1.txt`.

The browser regression in `e2e/typography.spec.ts` compares actual glyph
rasters with the font's missing-glyph raster. It covers all reachable registry
countries at both rendered weights and structured official facility fallbacks,
so a loaded font file with incomplete coverage fails before a release even
when `document.fonts.check()` would incorrectly report success. Production
visual validation repeats the check against the then-current public provider
rows; provider-corpus coverage must be refreshed when those rows add glyphs.
