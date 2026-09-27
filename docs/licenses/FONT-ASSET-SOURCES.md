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

## 2026-09-12 UI copy refresh

The SC/JP 400 and 600 subsets were regenerated from the same SHA-256-verified
2.004 sources. Their corpus is the union of every previously bundled glyph
(including the provider snapshot) and all current app/lib product copy.
The KORETAIL Sans subset was refreshed from the SHA-256-verified full Pretendard
WOFF2 with the same union policy and its existing renamed name table.
Existing family names, weights and OFL licenses are retained. This adds missing
new copy/holiday characters without introducing external font requests.

## 2026-09-22 airport date copy refresh (review branch)

Only the SC 400/600 subsets needed new characters for the stored-date controls.
They were regenerated from the same SHA-256-verified 2.004 source using
FontTools 4.65.0 and Brotli 1.2.0. The corpus preserves all 2,159 existing
codepoints and adds two from current app/lib copy (2,161 total). Resulting
WOFF2 sizes are 269,028 and 272,812 bytes. Existing layout features, names,
weights and licenses are preserved; KO/JP assets and typography are unchanged.
This branch remains unmerged and does not change the running UI trial.
## 2026-09-21 industry guide copy refresh

The same checksum-verified upstream sources were used with FontTools 4.65.0
and Brotli 1.2.0. Each subset retains the union of its existing cmap and all
current app/lib `.ts`, `.tsx`, `.css`, `.mjs` and `.json` copy supported by the
source font. The KORETAIL Sans renamed name table is preserved; Noto instances
remain at weights 400 and 600. No family, CSS weight or font source changed.
Layout features are limited to the feature tags already present in each
original subset, avoiding unrelated alternate glyph expansion. Final sizes
remain within the existing 300 KB Korean / 320 KB CJK per-face budgets:
226,772 bytes (Korean), 277,860 / 281,668 (SC), 215,432 / 217,728 (JP).

Verified cmap growth: KORETAIL Sans 1,502 → 1,508; SC at each weight
2,159 → 2,223; JP at each weight 1,783 → 1,833. Every previously bundled
code point remains. The new playbook corpus initially lacked 6 Korean,
34 Chinese and 33 Japanese characters in its primary subset; after refresh
it lacks none. Browser coverage includes every sector in four languages.

## 2026-09-23 latest-main reconciliation

Merged main 43ce9f61af0fdde126ff7369992755098e4f6b8a, retaining #207's Korean-page font loading restrictions and #208's GitHub-record policy. The previously prepared Korean subset already contains all 1,502 main code points plus the six new playbook syllables; no font regeneration or full-font loading was needed. Generated the new main coverage fixture directly from that 226,772-byte font (1,508 code points, zero removed). Existing four CJK subset files retain the guide's required characters and unchanged budgets. Browser checks still verify that Korean shell text does not fetch the 2 MB full font. No collector, schedule, dependency or runtime API change.

## 2026-09-23 ordered review integration

PR #205 follows #206. FontTools cmap comparison confirmed that both guide SC faces already contain all 2,161 airport-date code points (2,223 total), so the guide faces are retained without regeneration. No airport glyph is removed. The Korean font loading restriction from latest main remains intact.
