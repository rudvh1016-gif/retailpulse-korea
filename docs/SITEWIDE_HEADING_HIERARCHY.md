# Site-wide major-heading hierarchy — 2026-10-22 KST

Owner request: larger major headings with a preceding middle-dot-like marker,
throughout the **actual site**, not only an image. Base: `9de3fff346ec0da7e55bc7ee04d961dbc1f41994`.

## Scope and implementation

- Explicit `data-heading` roles; no global h-tag reset or body-token changes.
- Page titles: 28–36px; section titles: 22–26px; selected subsection titles: 18–20px.
  Editorial introductions retain a larger 32–48px scale.
- Home's `01 시간·터미널`, `02 노선·휴일 준비`, `03 품목별 확인` use the section scale; their parent heading is 26–30px to retain distinct nesting.
- Every opted-in title has one empty `aria-hidden="true"` span drawn as a small
  `currentColor` circle. No extra spoken punctuation. Wrapped lines align with text.
- Original heading elements, IDs, children, links, data, controls and loading states remain.
- No backgrounds, theme migration, body-copy sizes, data logic, glass dock or API changes.
- Interactive titles inside buttons/links/summaries are unchanged. Compact terminal
  artwork labels, facility/source/event names and other data labels remain unchanged.
- CSS role selectors intentionally supersede legacy compact heading `!important`
  rules. Their specificity and explicit roles keep the override off unrelated content.

## Route audit

Shared components cover all four locales and all five main navigation destinations:
`/[locale]`, `/airport`, `/airport-countries`, `/airport-prepare`, `/more`.
Secondary routes include `/where-to`, `/consumption`, the four district views,
`/business`, `/forecast`, `/insight`, `/about`, `/tourism-desk` and its area routes,
`/airport-news`, `/travel-records`, plus install/update dialogs, not-found and existing
preview routes. H1/H2 content headings and selected major H3 headings were inspected.
The audit distinguishes real section headings from compact item/data/control labels.

## Verification

- 21 focused unit/source/static-render assertions pass, including existing briefing
  content/boundaries, notice identity and disclosures, plus four new hierarchy checks.
- Existing source assertions now recognize the explicit role and decorative element.
  The Korean brief snapshot still compares all original markup after removing only
  the new role attribute and empty marker; no content baseline was rewritten.
- Component-preservation check: stripping only the role attribute and marker from
  changed TSX components reproduces base-main component files byte-for-byte.
- 33 Playwright cases are wired to a branch-gated read-only CI job (also included in the unchanged full suite): 10 actual routes at
  320/390/1440px and English/Chinese/Japanese home at 320px, with screenshots,
  computed sizes, marker accessibility, wrap/overflow, disclosures and dock checks.
- Local browser execution was denied earlier and was **not attempted**. Browser
  verification and screenshots remain pending CI; do not call this visually verified.
- Full local typecheck was not repeated after the known memory failure. Normal CI
  typecheck/build remain required before publishing; no merge/deployment is authorized
  by this working-tree implementation alone.
