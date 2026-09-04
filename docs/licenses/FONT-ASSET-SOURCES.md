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
sources, then subset with FontTools/Brotli against the same complete product
copy corpus and shared punctuation ranges. The exact 2.004 license is retained
as `NOTO-CJK-OFL-1.1.txt`.

The browser regression in `e2e/typography.spec.ts` compares actual glyph
rasters with the font's missing-glyph raster. A loaded font file with incomplete
coverage therefore fails before a release even when `document.fonts.check()`
would incorrectly report success.
