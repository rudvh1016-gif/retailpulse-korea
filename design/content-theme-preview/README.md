# KORETAIL — content-preserving theme review (not production)

Owner selected **Beautiful Jekyll (#7)** and requested other recommendations with **all existing content retained**. These are CSS adaptations on the unchanged KORETAIL app, not Jekyll/Ghost/Hugo migrations or static replacement dashboards.

## Baseline and scope

- Verified remote baseline supplied by coordinator: main `9de3fff346ec0da7e55bc7ee04d961dbc1f41994`.
- Exact reconstructed source tree before preview files: `a48aeffba6fcf871dd94bdd1a455e7d77fde6a05`.
- Local detached ancestry is older; content tree, not that older commit, is the verified basis.
- Preview adds only CSS assets, a test/config, this record and branch-gated artifact steps in existing ordinary PR CI.
- **Never merge this branch or deploy it.** Production CSS/components/data sources remain untouched. No manual dispatch or checks bypass.

| Existing label | Existing route | Evidence planned |
|---|---|---|
| 한눈에 | /ko/airport-glance | All 3 styles, 390/1440, viewport + full page |
| 공항현황 | /ko/airport | All 3 styles, 390/1440, viewport + full page |
| 국가별 흐름 | /ko/airport-countries | All 3 styles, 390/1440, viewport + full page |
| 미리 준비 | /ko/airport-prepare | All 3 styles, 390/1440, viewport + full page |
| 더보기 | /ko/more | All 3 styles, 390/1440, viewport + full page |

More keeps its existing links to Seoul, district detail, consumption, business, guide, records, about, sources/settings. Those downstream routes are not separately visually redesigned or screenshot-certified by this bounded review. App sources are unchanged, so their functionality is not replaced. Expanded content is retained in original native disclosures, not discarded.

## Three directions

1. **Beautiful Jekyll:** light-gray masthead, centered strong editorial title, readable bounded column, generous section rules. Primary recommendation selected by owner.
2. **Casper:** wider publication layout, bold centered heading, responsive editorial feed, larger country-card headings.
3. **Story:** light-weight left-aligned headings, wider spotlight spacing and quiet rules. Existing data-panel layout retained rather than substituting a generic photography landing page.

Existing KORETAIL fonts, all imagery and modules remain. No new AI artwork, airport/aircraft stock photos, external fonts, packages or demo imagery. These original small CSS adaptations borrow visual grammar, not source CSS. They are not pixel-exact template copies. Original existing data artwork is not being replaced by newly generated imagery.

## Reference evidence

Official pages read as web text, **not live pixel-inspected**:
- https://beautifuljekyll.com/
- https://casper.ghost.io/
- https://html5up.net/uploads/demos/story/

CSS/source rules independently inspected by reference worker:
- https://raw.githubusercontent.com/daattali/beautiful-jekyll/master/assets/css/beautifuljekyll.css
- https://raw.githubusercontent.com/TryGhost/Casper/main/assets/css/screen.css
- https://raw.githubusercontent.com/TryGhost/Casper/main/assets/css/global.css
- https://raw.githubusercontent.com/caressofsteel/hugo-story/master/assets/sass/components/_banner.scss
- https://raw.githubusercontent.com/caressofsteel/hugo-story/master/assets/sass/components/_spotlight.scss

Story visual concept credit: HTML5 UP / AJ; Hugo Story reference: CaressOfSteel. No source CSS copied. No Casper excerpt clamps or Story hidden-on-load transitions adopted.

## Evidence contract

The harness uses existing `e2e/fixtures/airport-focus` captured fixtures. **Selected date: 2026-10-19; these are historical test captures, not today's live values.** Undated summary requests get original clock metadata only, never historical counts relabeled as live. Fixture provenance/qualifiers in the existing app are preserved.

For each theme/viewport/route:
1. Load actual app, wait for hydration/data/fonts, retain original five navigation labels.
2. Inventory all text nodes (including closed disclosure contents), rendered text, link targets, buttons/inputs/selects, labels, image alternatives, SVG text and change-rate text/colors.
3. Record baseline full page, inject only the preview stylesheet and one root data attribute.
4. Assert exact inventory equality and no page-level horizontal overflow; save full page and first-screen image plus JSON inventory.
5. Toggle first visible native disclosure and compare expanded inventory; operate home terminal selection; click real nav and check resulting route.

This is bounded preservation evidence, not an exhaustive proof of every interactive state. Main production regression checks remain intact. Review the screenshots before claiming visual quality or complete preservation PASS.

## Run policy and status

Local Chromium launch was not authorized and **was not attempted**. Locally only discovery/lint/static checks are allowed. Ordinary PR CI on `preview/content-preserving-themes-20261021` runs the dedicated config in the existing bounded country-route job and uploads `content-preserving-theme-previews` for seven days. It neither deploys nor modifies providers/storage.

Pending: coordinator review, draft PR, normal CI, artifact inspection and fixes if needed. No screenshots or browser PASS claimed before CI evidence exists.
