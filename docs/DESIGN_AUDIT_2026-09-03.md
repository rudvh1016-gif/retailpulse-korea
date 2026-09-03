# KORETAIL — Phase C Design / Brand / UX / SEO Audit

**Audit date:** 2026-09-03 KST  
**Audited commit:** `54dbe228a71d669262856dcfa8147c5bed56be77` (main)  
**Owner decision applied:** white-first visual system (hard requirement; see the Phase C/D/E continuation brief)  
**Status:** findings + prioritized fix list. No product code changed in this PR.

## 0. How this audit was measured

- Production (`https://koretaildata.com`) is **not reachable from the audit sandbox** (proxy policy denial, HTTP 403 on CONNECT). Real-production screenshots and a production Lighthouse run were therefore **확인 못 함** here. Production reachability and page/API health were last proven by GitHub Actions `site-smoke.yml` run `33717757521` (all checks `ok:true`).
- Everything below was measured on a **local build of the same commit** (`npm run dev`, port 4173) with the e2e summary fixture routed into `/api/live/summary`, using headless Chromium at 390 / 768 / 1280 / 1440 / 1920 px and in ko / en / zh / ja. The rendering code path is identical to production; only the data payload is a fixture.
- Numbers quoted (document heights, count of sub-10 px text nodes, overflow) come from `document.documentElement` / `getComputedStyle` in those runs.

## 1. Brand / visual system

| # | Finding | Evidence | Severity |
|---|---|---|---|
| A1 | **Beige everywhere.** Page, cards, tiles, nav bars and the PWA chrome all use the warm-paper palette: `--paper #f5f3ed`, `--surface #eae7df`, `--line #d5d3cc`, chart bars `#cfcdc6`, bottom nav `rgba(245,243,237,.94)`, sticky airport nav `rgba(245,243,237,.96)`, `theme-color` and `manifest` `#f5f3ed`. Body background measured `rgb(245,243,237)` on every page. | `app/globals.css` `:root`, `app/layout.tsx` viewport, `public/manifest.webmanifest` | **P0** — violates the white-first decision |
| A2 | **Type is too small in too many places.** CSS declares 18 rules at 8 px, 19 at 9 px, plus 7 px / 7.5 px / 6.4 px. Measured 32–40 rendered text nodes under 10 px per Seoul page and 36–40 on the airport page: eyebrows, freshness chips, KST chip (9 px), bottom-nav labels (8 → 7 → 6.4 px), checkpoint sub-labels (8 px), history KPI captions (8 px). | `grep font-size app/globals.css`; DOM count in audit run | **P0** (readability, accessibility, "template" feel) |
| A3 | **Brand block is undersized.** Wordmark 13 px, descriptor 8 px, in a 76 px header. It reads as a chip, not a product name. | `.brand`, `.brand-descriptor` | P1 |
| A4 | **Three card grammars on one page.** Signal rows are container-less; event cards are bordered boxes; commercial / Store Dynamics tiles are a 1 px-gap grid painted with `--line` behind `--paper` cells; the selected home row uses a translucent white fill plus an inset 2 px shadow. Same page, four surface treatments. | `.signal-row`, `.event-card > article`, `.store-dynamics-counts`, `.home-area-brief-rows button.selected` | **P0** (card consistency) |
| A5 | **Mobile bottom tab bar is rendered on desktop.** A fixed 5-icon nav with 7–8 px labels spans the full width at 1280–1920 px and overlays content. It is the single strongest "app template" cue on desktop. There is no desktop top navigation. | `.bottom-nav` (no desktop breakpoint), screenshots at 1280/1440/1920 | **P0** |
| A6 | Width system is sound: `--w-narrow 1000 / --w-standard 1240 / --w-wide 1440`, prose capped (`max-width: 68–70ch`), no horizontal overflow at any tested width (`scrollWidth === clientWidth` at 390/768/1280/1440/1920). Keep. | audit run | OK |
| A7 | Radius / shadow discipline is already good (mostly 0 radius, one inset shadow, one modal backdrop). Keep; only the pill toggle (`.airport-checkpoint-toggle`, radius 999px) breaks the square grammar. | CSS | P2 |
| A8 | Accent: single brand blue `#214cff` used for selection + one key value; green/amber/red reserved for status. Keep. | CSS | OK |

## 2. UX / information architecture

| # | Finding | Evidence | Severity |
|---|---|---|---|
| B1 | **Home page and area page are the same page.** `/ko` and `/ko/myeongdong` render the identical component, identical H1 ("지금 서울은 어떻게 움직이고 있나요?"), identical body; only `<title>`/description differ. The selected area's brief therefore appears **twice** on home (once in the "서울 지금" row list, again as the "명동 · 지금" block directly below it). | `app/[locale]/page.tsx` vs `app/[locale]/[slug]/page.tsx` both mount `RetailPulseApp` with `view="today"`; screenshots | **P0** (UX + SEO duplicate content) |
| B2 | **Business page buries its own content.** It re-renders the entire Seoul signal block (population, card spend, weather, mobility, events, arrivals, sales, Store Dynamics) above the business checklist. Measured height 4,388 px desktop / 6,176 px mobile; the checklist starts roughly 3,000 px down. | `BusinessView` mounts `<LiveSignals>` before `industry-section`; screenshots | **P0** |
| B3 | **Footer links run together as one word**: `HOME명동홍대성수공항매장기록소개`. `.footer-links` has no CSS rule at all. Every page. | `grep footer-links app/globals.css` → no match | **P0** (bug) |
| B4 | **H1 lines have no separator.** The hero splits copy on `\n` into `<span>`s with no space, so the accessible name / crawled text is `지금 서울은어떻게 움직이고 있나요?` and `How is Seoulmoving right now?`. | DOM `h1.textContent` in audit run; `RetailPulseApp` hero markup | **P0** (a11y + SEO) |
| B5 | Long mobile pages: Seoul page 5,378 px at 390 px, business 6,176 px. Mostly a consequence of B1/B2 and the dense source notes under every row. | audit run | P1 |
| B6 | Current-consumption row is **already truthful** — label "최근 10분 내국인 카드 소비", reference "14:05 기준 최근 10분", disclaimer "신한카드 내국인 결제 기반 · 전수 매출 아님 · 외국인 소비 아님". Remaining gap: the *estimate* nature and "오늘 누적 아님" are not in the label/first line, and the disclaimer sits in 11 px muted text under the tiles. | `text.commercial`, `commercialDisclaimer`, `formatCommercialReference` in `app/live-signals.tsx` | P1 (wording placement) |
| B7 | Events panel already shows the top 3 with an expand toggle (`aria-expanded`), period + distance, the provider's own preview, and the official link when present. Gap: card preview is one sentence; "전체 N건 보기" is a bare underlined button; official-link affordance is weak. | `EventSignalPanel`, `EventCard` | P1 |
| B8 | Population wording is already explicit ("현재 추정 인구 … · 현재 시점 추정 범위 · 오늘 누적 방문객 아님"). Keep. | `text.currentPopulation`, `notCumulative` | OK |
| B9 | Airport: the checkpoint list is **already collapsed** to the longest-wait checkpoint per terminal with an `aria-expanded` toggle; a "지금부터 오늘 끝까지" remaining-passengers tile and a peak tile exist; Seoul uses **arrival** (not departure) forecast rows as the demand-leading signal. Requirements 6B / 6C.1 / 6C.2 of the brief are largely met today. Gap: per-zone / per-facility context does not exist yet (Phase E). | `AirportTodaySummary`, `LiveSignals` arrival rows | OK / Phase E |
| B10 | English uppercase eyebrows on every page in every locale ("OFFICIAL DEMAND SIGNALS · SEOUL", "CURRENT OBSERVATION · 전체 공항"). Consistent, but at 8–10 px they read as decorative chrome and add untranslated English to ko/zh/ja pages. | `.eyebrow` usages | P1 |
| B11 | Nav label vs route mismatch: the "기록/Records" tab lives at `/forecast` and its title says "공식 기록과 숫자 설명". Renaming the slug needs redirects; defer. | `seo-config.ts` `forecast` slug | P2 |

## 3. SEO / discoverability

| # | Finding | Evidence | Severity |
|---|---|---|---|
| C1 | Per-route SSR metadata is correct: unique `<title>` and description per page and locale; `canonical`; `hreflang` for `ko-KR / en / zh-CN / ja-JP / x-default(→/en)`; `og:*` (title, description, url, site_name, type, locale); `twitter:card=summary`; `html lang` per locale (`zh-CN` for zh). Verified in DOM for every audited route. | `app/seo-config.ts`, `app/layout.tsx`, audit run | OK |
| C2 | **Duplicate content**: home and each area page share H1 and body (B1). Search engines see four near-identical documents per locale differing only in title. | B1 | **P0** |
| C3 | **No social preview image.** No `og:image` / `twitter:image`; `twitter:card` is `summary` without an image. | `layout.tsx` metadata, `buildMetadata` | P1 |
| C4 | Structured data is a single site-wide `WebSite`/`WebApplication` block. No per-page `WebPage`, `BreadcrumbList`, or `Organization`. | `layout.tsx` | P1 |
| C5 | `theme-color` and manifest colors are beige (`#f5f3ed`) — will be wrong after the white-first change and affect the mobile browser chrome / PWA splash. | `layout.tsx`, `manifest.webmanifest` | P0 (bundled with A1) |
| C6 | Heading hierarchy is sane (h1 → h2 sections → h3 groups → h4 rows) apart from B4. | audit run: h2 2, h3 4, h4 15 on Seoul pages | OK |
| C7 | `robots.txt` allows `/`, disallows `/api/`, lists the sitemap; sitemap has 36 URLs (4 locales × 9 routes) but `lastModified` is *now* on every request — a weak, always-changing signal. | `app/robots.ts`, `app/sitemap.ts` | P2 |
| C8 | `/` 308-redirects to `/ko` with no `Accept-Language` negotiation; acceptable for a Korea-first product, `x-default` correctly points to `/en`. | `app/page.tsx` | OK |
| C9 | Performance blockers: fonts are self-hosted, subset, `font-display: swap`, and JP/SC faces are only used under `.lang-ja` / `.lang-zh` so they are not fetched on ko/en pages. No render-blocking third-party CSS. CSP still allows `cdn.jsdelivr.net` / `fonts.googleapis.com` for styles and fonts although nothing is loaded from there — tighten later. | `globals.css`, `next.config.ts` | P2 |
| C10 | A production Lighthouse / CWV measurement: **확인 못 함** from the sandbox (see §0). | — | note |

## 4. Responsive review (390 / 768 / 1280 / 1440 / 1920)

- No horizontal overflow at any width on Seoul, airport, business, about, records, more pages (measured).
- 768 uses the mobile layout (breakpoint 820 px) — acceptable.
- 1440 / 1920: content capped at 1440 px with 44 px gutters; desktop still shows the fixed bottom tab bar (A5).
- 390: hero at 33–35 px is fine; the page lengths (B5) and 6.4–8 px nav labels (A2) are the mobile problems.

## 5. Language review (ko / en / zh / ja)

- All four locales render the same structure with translated labels; Noto Sans JP/SC load only for ja/zh.
- EN hero copy "How is Seoul moving right now?" is fine visually; B4 breaks its text form.
- zh uses `zh-CN` document language; ja/ko correct.
- English eyebrows persist across locales (B10).
- No legacy "RetailPulse" string remains in public UI (only internal identifiers).

## 6. Prioritized fix list

### Must change now (Phase D scope)

1. **White-first tokens** (A1, C5): `--paper #FFFFFF`, card `#FFFFFF`, `--line #E5E5E5`, `--ink #111111`, `--muted #666666`, muted surface `#F7F7F7` only where a surface is needed (tile grids, sticky nav backdrop), chart bar neutral `#D9D9D9`, `theme-color` + manifest `#FFFFFF`.
2. **Unify the card grammar** (A4): one bordered white card (1 px `#E5E5E5`, 0–2 px radius, no shadow) for event cards, commercial tiles and Store Dynamics tiles; signal rows stay rows; selected home row uses a left rule only.
3. **Desktop top navigation; bottom tabs mobile-only** (A5).
4. **Type floor** (A2, A3): nothing under 10 px; eyebrows 10–11 px; notes 11–12 px; brand 15–16 px + descriptor 10 px; KST chip 10–11 px.
5. **Home ≠ area page** (B1, C2): home keeps hero + "서울 지금" row list + Seoul-wide rows; area pages get an area-specific H1 ("명동, 지금") and intro, and the area brief appears once.
6. **Business page leads with the checklist** (B2); the Seoul signal block becomes a short link/summary, not a second copy.
7. **Footer links CSS** (B3).
8. **H1 line separator** (B4): render lines with `<br />` or a space so text content is correct.
9. **Consumption row wording placement** (B6): first line "신한카드 내국인 결제 추정 · 최근 10분 기준 · 오늘 누적 아님"; keep the full disclaimer.
10. **Events** (B7): stronger official-link affordance, complete preview sentence, clearer "전체 N건" control — no new provider calls.
11. **SEO** (C3, C4): static `og:image` (1200×630) per site, per-page `WebPage` + `BreadcrumbList` JSON-LD, `theme-color` white.

### Can wait (after Phase D)

- Sitemap `lastModified` per deploy (C7); CSP tightening (C9); `/forecast` → `/records` slug with 301s (B11); eyebrow localisation (B10); language negotiation on `/` (C8).

### Verification plan for Phase D

- Unit + build + Playwright (existing 43 e2e specs, several assert the current strings/geometry and must be updated deliberately, not weakened).
- Re-run this audit script at 390/768/1280/1440/1920 × ko/en/zh/ja; require `body` background `rgb(255,255,255)`, zero text nodes < 10 px, no overflow.
- GitHub `site-smoke.yml` on production after deploy (the only production reachability path from this environment).
