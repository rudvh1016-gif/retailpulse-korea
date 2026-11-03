# Briefing count symbols — 2026-11-03

Owner request: remove only the symbols immediately before people/day and flights/day in the second comparison of the Korean “출근 후 30초 확인” card. Preserve the decrease wording, red color, parenthesized percentage triangle, original calculations and other screens.

The shared count component has a default-on `showSymbol` presentation option. Only the Korean card's two second-comparison call sites opt out via `showCountSymbol`. Leading plus and hollow-triangle signs are omitted consistently; increase/decrease/no-change wording still comes from the original signed delta. Direction attributes, colors and screen-reader wording keep the signed value. Percent formatting, count precision, less-than bounds, missing values, first/weekly comparisons, other callers and other languages retain their defaults. No data/API/scheduler or CSS changes.

Baseline main `39a5c8f29786fe4207135ae5b6509ff9fd3fa6b9` includes the intervening airport connection handoff release; this patch does not touch those files.

Local evidence: 22 related rendered/unit checks pass, including the requested 3,606 people and 11.9 flights examples, positive/negative/zero/subresolution/missing cases and unchanged default symbols. Twenty-nine browser checks pass across 320/390/430/768/1440px and four locales, preserving colors, percentage signs, calculations, keyboard disclosures and no overflow. TypeScript and changed-file ESLint pass. Exact commit, CI, merge/deployment and actual live verification are recorded in the PR body; do not treat pending publication as completed.
