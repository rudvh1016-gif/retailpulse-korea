# Seoul upcoming forecast — actual preview awaiting review

The owner requested a restrained ink-blue range plot and smaller selected values for the existing “앞으로 · 예상” component, followed by an actual preview before publication. This branch is isolated from Claude's weekly forecast work and from airport chart A.

Only PopulationOutlook presentation changes: thin ink-blue upper/lower edges, a 10% fill, a thin selected range and mint selection guide. The selected value uses the existing 13px mobile / 14px desktop body token. Axis text grows from 9px to 11px for readability. The requested ink-blue preview replaces this component's old dashed blue edges; the separate population history chart retains its existing appearance. No shared font family or typography token changes.

Source min/max, issued/target timestamps, gaps, zero and missing handling, SVG point coordinates and selection controls remain unchanged. There is no fabricated midpoint, smoothing, interpolated source value, new request, dependency, collector or storage change. The existing selection test changes only its old 26px expectation to the approved body size; all value, geometry, keyboard, area switch and refresh assertions remain.

Real local Chrome screenshots use the public summary retrieved at 2026-10-12T03:16:51.927Z, with the clock fixed to that source snapshot. The live forecast's initial selected range is 86,000–88,000 people; keyboard selection of the last time reads 10,000–12,000 at October 13 00:00 KST. The actual 94,000 ceiling is derived from this snapshot, not copied from the owner's reference image. Both widths have no horizontal overflow or page errors, and reduced motion was enabled.

- [Mobile 390px](screenshots/seoul-outlook-ink-20261012/seoul-range-current-390.png)
- [Desktop 1440px](screenshots/seoul-outlook-ink-20261012/seoul-range-current-1440.png)

The supported Library upload connection is currently unavailable; no image Library IDs are claimed. These repository captures are review evidence, not public-site delivery. Merge/deployment requires review of the actual preview. No controlled before/after performance benchmark was run, so no speed improvement is claimed.

Local checks passed: TypeScript, scoped ESLint, unchanged UI-lock, 11 demand/flow unit tests, native vinext build, 46 rendered HTML tests and 15 browser tests. Browser coverage includes exact source geometry, four languages, 320/390/430/1280px, keyboard selection, area navigation, live refresh and selected-time removal. Existing frontend-design and web-design-guidelines skills were applied without duplicate installation. No new motion, focus behavior or touch target changes.

## Revised compact range candidate

The previous chart was rejected and remains unpublished. This revision reduces the plot from292 to220 SVG pixels while keeping source min/max endpoints exactly proportional to the same zero/ceiling scale. The ink-blue upper/lower bounds and restrained fill show only the supplied range; there is no midpoint or fabricated central curve. A short mint vertical range with end caps marks the selected original min/max, replacing the long selection guide. Time buttons become compact text rows with a mint underline, and the selected exact range and KST time share a row. Midnight date text stays; the decorative vertical midnight line is removed. Forecast gaps and source/issue times are unchanged.

- [Revised PC1440](screenshots/seoul-range-refined-20261012/seoul-range-refined-1440.png)
- [Revised mobile390](screenshots/seoul-range-refined-20261012/seoul-range-refined-390.png)

Same stored public snapshot12:16 KST, initial86000–88000 and last10000–12000 at October13 00:00. Browser pixels inspected. Targeted type/lint/build PASS, selection browser7 PASS (320/390/430/1280 and4 languages, min/max coordinates with the new plot height, keyboard, area changes, refresh and removal), UI-lock unchanged PASS. Tests update only the y-scale geometry for the smaller plot, preserving exact source-bound comparisons. No broad existing feature suite repeated. One revised candidate, no public merge/deployment, no image generation; parent handles Library delivery.
