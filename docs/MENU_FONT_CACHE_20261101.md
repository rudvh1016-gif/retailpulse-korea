# Menu font cache correction

The current approved primary font includes U+BB58 (`뭘`). Its unchanged URL was also used by the earlier immutable cached subset that did not include that syllable. Supplying the prior `c6b691b5` resource reproduced the mixed menu: Chromium reported nine KORETAIL glyphs and one Malgun Gothic glyph. The current font's coverage/hash checks already pass; no font regeneration is needed.

Version the primary CSS URL and its Korean/English preload with the first 12 characters of the actual font SHA-256. This gives returning browsers a fresh cache key and keeps preload/style requests identical. The font bytes, family, weight range, sizing, other menu styles and cache headers are unchanged. A test requires the URL version to track future font-byte updates.

One exact reversible protection pair permits only this primary font source URL substitution in `app/globals.css`. The unchanged canonical stylesheet hash and all other protected styles remain enforced. The browser regression supplies a bundled Hangul-free subset as an unversioned-resource sentinel in memory, requires one current-version font request and no legacy request, checks actual platform fonts and missing-glyph rasters, and captures the PC menu at 1000/1440px. No provider calls, operational data or account settings are changed.
