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

## Update 2026-10-14 — Apple-like outlook (owner request)

The owner asked for a more attractive, Apple-like chart with the selected hour clearly visible ("지금 차트이미지가 너무안예뻐 제일적합하고 애플느낌으로 어울리는 차트이미지를 넣고 해당시간대를 누르면 그 시간대의 선에 딱 보이게해야해 / 지금은 초록점이ㅜ너무작아서 안보여"). This supersedes "no smoothing" above for this component only: each band edge is now the airport figure's monotone cubic through the exact published hourly min and max (it never rises above or dips below the two values it joins; a run where the two edges would cross keeps straight edges). Still no midpoint or central curve, no interpolated source value, gaps unchanged. A narrow range (median under 7px) reads as one solid ink-blue ribbon between the exact edges; the selected hour shows a full-height mint guide, a min–max capsule with end dots (one knob when the range is narrow) and a time pill. Record: docs/approvals/seoul-outlook-chart-20261014.json.

Follow-up the same day ("이거 차트이미지는 좋은데 초록색글자나 선 이런느낌이 너무클로드ai같아 싹빼고 선을 연하게하고 애플감성느껴나게해줘"): the shape stays; every green in the outlook is gone and the line is lighter. The band is a light azure (#5296ec, still 3:1 against white) with 1px edges and a 14% fade; the selected hour is a hairline grey guide, a light grey time pill with dark text and an Apple-blue (#007aff) capsule/knob on a white halo; the selected hour button is ink and semibold over an ink underline; labels are neutral grey (#6e6e73).
