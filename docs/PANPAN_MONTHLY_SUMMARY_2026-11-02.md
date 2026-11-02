# Panpan monthly summary — 2026-11-02

The owner requested priority correction of the one-store monthly summary and relocation to the very bottom of the shopping report.

Cause: `#monthly-mix` was a separate, hardcoded T1 east 12 GATE food example preceding the six-store detail section. Its example was additionally hidden on desktop. The underlying six-store/30-category data and details were complete; this was a presentation omission, not a missing-store collector issue.

The summary is now the last section in `main`, after store details, the monthly selector, and existing source links. All six stores appear on mobile and desktop. Each compares its September-leading category to the **same category** in August, explicitly labeled as sales composition, not revenue change. Original decimal precision is retained under the separately approved shopping-report rule.

Source: existing audited `data/shopping-briefing-panpan-2026.json`, described in `SHOPPING_BRIEFING_2026-11-01.md` and `SHOPPING_REFINEMENTS_2026-11-01.md`; official file https://www.data.go.kr/data/15084726/fileData.do. This change does not claim newly obtained later months. The confirmed page coverage and absence of confirmed later-month comparisons are visible. Missing comparisons render “전월 비교 자료 없음”; zero is a valid observation.

| Store | Same category | August → September | Difference (%p) |
| --- | --- | --- | --- |
| T1 east 12 | Food | 64.9 → 61.4 | -3.5 |
| T1 west 41 | Food | 56.4 → 50.0 | -6.4 |
| T2 east 274 | Food | 44.1 → 46.3 | +2.2 |
| T2 west 225 | Beauty | 74.0 → 75.5 | +1.5 |
| T2 east 281 | Beauty | 58.9 → 54.0 | -4.9 |
| T2 west 218 | Beauty | 59.2 → 57.3 | -1.9 |

`node scripts/panpan-monthly-summary.mjs` regenerates this static section deterministically from that source. No browser fetch, dependency, collector, scheduler or D1 change.

Local evidence: all six shopping/data unit tests passed, including missing-source handling and exact generated HTML; 16 Chromium shopping-report checks passed across 320/390/600/820/821/1440px. Existing store details, selectors, keyboard disclosure behavior, reduced motion, source links and navigation are preserved. Exact PR commit, Linux CI, merge and actual production result are recorded in the PR body; pending release is not completion.

Separate earlier gauge work remains preserved in PR #561 and is not included in this priority patch.
