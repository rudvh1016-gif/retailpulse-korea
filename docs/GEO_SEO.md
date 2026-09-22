# KORETAIL — search and answer-engine discoverability

**Worked:** 2026-09-22 KST
**Branch:** `claude/latest-git-pull-check-m6piv4`
**Scope:** making the site readable by search crawlers, by Naver, and by the
answer engines that quote sources without ever running JavaScript.

This document records what was measured, what changed, what was deliberately
not changed, and what only the owner can do. It is the reference for anyone
who later wonders why a decision here went the way it did.

## 1. What was actually wrong

The built Worker was rendered and the text in the **first HTML response** —
what a crawler receives before any JavaScript — was counted for every
indexable page in every locale.

| Page | Crawlable characters, before |
|---|---|
| `/zh` | 263 |
| `/ko` | 318 |
| `/ja` | 302 |
| `/ko/myeongdong` | 350 |
| `/ko/airport` | 435 |
| `/en` | 478 |

Twenty-two of the forty pages measured sat under 600 characters, and
twenty-eight served a localized "로딩 중 / Loading" where their content belongs.
Almost all of the remainder was navigation chrome.

The cause is structural rather than accidental. `app/retailpulse-app.tsx` is a
client module and every figure on those screens arrives from
`fetch('/api/live/summary')` after hydration. A reader that never executes the
page's JavaScript therefore sees a shell.

**That reader is most of the audience KORETAIL is trying to reach.** Vendor
documentation and server-log studies through 2026 agree that GPTBot,
OAI-SearchBot, ClaudeBot, Claude-User, PerplexityBot, CCBot and
Meta-ExternalAgent read the first HTML response and move on — one study of
over 500 million GPTBot fetches found no evidence of JavaScript execution at
all. Naver's Yeti renders JavaScript unreliably, and Naver is where the Korean
half of this audience searches. Google's own AI optimization guide sets the
floor plainly: a page has to be indexed and eligible for a snippet before it
can appear in any AI feature, and "optimizing for generative AI search is
still SEO".

A second, compounding cause: `app/robots.ts` disallows `/api/`, and Googlebot's
renderer does not fetch robots-disallowed subresources. So even the crawler
that *does* execute JavaScript was rendering the placeholder.

## 2. What changed

### The fix that was not chosen

Server-rendering the live numbers is the obvious answer and it is the wrong
one. `tests/edge-cache.test.mjs` records roughly **2,795 D1 rows read per
uncached `/api/live/summary`** against the 5,000,000 rows/day free ceiling in
`docs/ZERO_COST_HYBRID_AUDIT.md`. Twenty named crawlers across fifty-two URLs
would spend it, and a Cloudflare Free HTTP invocation has 10 ms of CPU for the
whole render. Opening `/api/` to crawlers has the same problem.

### The split that was chosen

The live numbers stay on the client behind their own freshness labels. What
moved to the server is the half of every page that is **true all day**:

- `lib/source-catalog.ts` — the twenty official sources as plain data, lifted
  out of the client module `app/source-status.tsx` (which now re-exports it, so
  there is one copy of the text).
- `lib/page-brief.ts` — per page: what the screen answers, which institution
  each number comes from, what it does not mean, and the questions readers
  actually arrive with. Four languages.
- `app/page-brief.tsx` — a server component rendering it as ordinary visible
  text at the end of `<main>`, passed into the client shell as a slot so it
  costs no client bundle, no fetch and no D1 read.

Visible, not hidden. Text served to a crawler and withheld from a reader is
cloaking, and the penalty is worse than the problem it would solve.

**Measured after:** no page under 900 characters. Korean total across ten
pages 8,277 → 20,030. Per-locale minima ko 1,424 · en 2,722 · zh 1,059 ·
ja 1,268.

### Everything else

| Change | Where |
|---|---|
| 22 AI and Korean crawlers named explicitly, each group repeating `Disallow: /api/` and `/_vinext/` | `app/robots.ts` |
| Robots checks scoped to the `*` group per RFC 9309 §2.2.1 | `lib/discoverability.ts` |
| One `@graph` joining Organization and WebSite by `@id`, every WebPage pointing back at both | `app/seo-config.ts`, `app/layout.tsx` |
| `FAQPage` JSON-LD generated from the same array the page displays | `lib/page-brief.ts` |
| Outbound citations to each dataset's catalogue entry — the site had none | `lib/source-catalog.ts` |
| `max-snippet:-1`, `max-video-preview:-1` | `app/layout.tsx` |
| Descriptions brought inside one width band | `app/seo-config.ts` |
| `/llms.txt`, generated at build | `scripts/build-llms-txt.mjs` |
| A visible `<h1>` on the four locale home pages | `app/retailpulse-app.tsx` |

## 3. The Naver / Google description conflict, resolved

The downloaded Naver skill asks for a meta description of **at most 80
characters**. `lib/discoverability.ts` already enforced a **minimum snippet
width of 80 half-width units**, because Google replaces a snippet that is too
thin with text it picks itself. These look contradictory and are not.

Google truncates by **pixels**, at roughly 160 Latin characters. A Korean
character is about twice as wide, so 80 Korean characters and 160 Latin ones
occupy the same width — which is exactly what `snippetWidth()` counts. One
ceiling in half-width units satisfies both engines, and the existing minimum is
the floor of the same band.

Measured before: three Korean pages were over Naver's cap (`/ko` 99 characters,
`/ko/forecast` 91, `/ko/predictions` 88) and seven pages across locales were
over Google's width budget. All fifty-two now sit between **84 and 160**
half-width units, with Korean additionally under 80 characters. Enforced by
`MAXIMUM_SNIPPET_WIDTH` and `NAVER_DESCRIPTION_MAX_CHARS` in
`lib/discoverability.ts`, in CI and against the live origin.

## 4. AI crawler access — allowed, on purpose

The 2026 publisher default is to block the training crawlers (GPTBot,
ClaudeBot, Google-Extended, CCBot) and allow only the answering ones, because
measured crawl-to-refer ratios are brutal — Anthropic around 2,200:1, OpenAI
around 217:1.

**That is an advertising argument.** It protects pageviews an in-chat answer
would otherwise have earned. KORETAIL sells no pageviews: no ads, no paywall,
no account. Its actual constraint is that nobody knows the brand exists, and
training inclusion is the only route by which an assistant names this site
without being handed a link first.

The cost side is bounded rather than assumed: fifty-two indexable URLs, static
assets served outside the Worker, no paid egress, and every named group closes
`/api/` and `/_vinext/`.

Two specific decisions a future session should not "fix" by copying the
default:

- **Bytespider is allowed**, against the common recommendation, because this
  site publishes Simplified Chinese pages for Chinese-speaking visitors to
  Korea and ByteDance's assistant is a discovery surface for exactly them.
- **Google-Extended is allowed**, because disallowing it withholds Gemini
  training only and has no effect on Google Search indexing or AI Overviews
  eligibility, both of which run on Googlebot. It would cost a surface and
  protect nothing.

## 5. llms.txt — shipped, believed in not at all

`/llms.txt` is generated at build into `dist/client` and served as a static
asset, so it costs no Worker invocation.

State its value honestly in any report:

- Google's Search Central guidance (2026-06-29) says publishing one "won't
  harm (nor help) your visibility or rankings in Google Search, as Google
  Search ignores them".
- No major AI provider has documented consuming a third-party llms.txt.
- A study of 500M+ AI-bot visits found 408 requests for the path. Among the 50
  most-AI-cited domains, one published the file.

It ships because it costs nothing and it is where the truth boundaries can be
stated in one machine-readable place. It is **not** a traffic mechanism and
must never be reported as one.

## 6. Deliberately not done

- **FAQ rich results are gone.** Google retired them for all sites on
  2026-05-07. The `FAQPage` markup still ships, because a question-to-answer
  mapping is the cleanest thing a non-Google engine can extract — but it earns
  no Google SERP enhancement and nobody should claim it does.
- **No `aggregateRating`, `Review`, `HowTo`, `Speakable`, `SearchAction`,
  `SiteNavigationElement` or `ItemList`.** KORETAIL has no ratings and no
  reviews; the rest are deprecated, unsupported, or describe something the
  page is not.
- **No `sameAs`, address, telephone or founding date on the Organization.**
  There are none to state. A recommended property filled with a plausible
  value is a fabricated fact.
- **No `alternateName: "RetailPulse Korea"`.** Tempting for entity resolution,
  but `CLAUDE.md` retired that name for public surfaces and JSON-LD is a
  public surface. The guard in `tests/rendered-html.test.mjs` caught it.
- **No `Dataset` claiming the twenty official sources as KORETAIL datasets.**
  That is a redistribution claim this product cannot make. The institution is
  the creator; KORETAIL publishes the presentation.
- **No `noscript` copy, no crawler-specific HTML, no prerendering fork.**
  Serving crawlers different markup is cloaking.
- **No padding to hit a character count.** Google has confirmed word count is
  not a ranking factor. The floors in CI are shell detectors, not targets.

## 7. Open — needs an owner decision

These were found, verified, and deliberately left alone.

1. **`workers_dev: true` publishes a second indexable copy of the whole site.**
   `wrangler.production.jsonc` sets it for both staging and production, so
   `…​.workers.dev` serves the identical build with `Allow: /` and fifty-two
   real pages. Google usually consolidates on the canonical tag; Naver's Yeti
   is materially weaker at cross-host consolidation, and Korean search is half
   this audience. Setting it to `false` is one line, but it may be the owner's
   deploy escape hatch — hence not changed unilaterally.

2. **`sitemap.xml` claims 44 pages changed today, every day.** The reasoning in
   `app/sitemap.ts` was sound when the page content was entirely
   client-rendered. It is weaker now: the server HTML a crawler receives is
   byte-identical between days, so the `lastmod` is demonstrably unreliable —
   which that file's own comment warns devalues the signal for every page
   beside it. A build-time stamp from the commit date would be honest. This
   reverses a previously reasoned, committed decision, so it is the owner's.

3. **`validate-production-env.mjs` does not pin the hostname.** It requires
   HTTPS and rejects localhost, but never checks *which* domain. Because
   `siteOrigin` is baked at build time, one wrong GitHub Variable silently
   repoints every canonical, hreflang, sitemap `loc` and the robots `Sitemap`
   line, and nothing would fail.

4. **The 404 page serves `index, follow`.** `app/[locale]/not-found.tsx`
   already declares `robots: { index: false, follow: true }`; vinext is not
   applying it and the root layout's value wins. Google honours the 404 status
   so the practical risk is low, but the two signals contradict each other.

5. **hreflang renders as `hrefLang`.** React 19 in this stack emits the prop
   name verbatim. HTML5 attribute names are case-insensitive, so every
   conformant parser — Googlebot included — reads it correctly; only a naive
   regex-based extractor would miss it. Recorded rather than worked around,
   because the workaround fights the framework for a case that may not exist.

## 7b. Measured after the fact — two claims checked, one true

An adversarial pass over this work claimed two performance regressions. Both
were measured against a build of the pre-change commit (5b22240) served side
by side with the current one, because a claim about a regression is only worth
acting on if the "before" number exists.

**Font — claim wrong on cause, real underneath.** The claim was that eight
Hangul syllables introduced by `lib/page-brief.ts` pushed every Korean page
into downloading the 2,057,688-byte Pretendard face. The syllables were real:
깔뀔끔났넣묻쓴힌 were absent from the 226 KB subset and zero were missing
before, with 묻 sitting in "자주 묻는 질문" on every Korean page. They are now
reworded away and `tests/font-coverage.test.mjs` fails on the next one.

But the causal claim does not hold. Measured on `/ko`, `/ko/myeongdong` and
`/ko/airport`, font bytes are **2,284,108 before and 2,284,108 after** — byte
for byte identical. Pretendard was already being downloaded on every Korean
page, because `.lang-ko` lists it as the second fallback (app/globals.css) and
something outside `app/` and `lib/` needs it. That is a genuine ~2 MB win
available on the most important pages, and it is **pre-existing**, not
introduced here. Finding what triggers it is the highest-value performance
work left on this site; it is not in scope for this change and is not claimed
as fixed.

**CLS — real on one page, and the opposite elsewhere.** Measured layout shift:

| Page | Before | After |
|---|---|---|
| `/ko` | 0.135 | **0.23** |
| `/ko/myeongdong` | 0.027 | 0.019 |
| `/ko/airport` | 0.035 | 0.002 |

So the claim of 0.58 on an area page is wrong — area and airport pages
improved, because the brief adds stable content to a page whose shifting
region is now a smaller fraction of it. `/ko` did get worse, and it was
already over Google's 0.1 threshold before. The cause is structural: the home
screen is lazy-loaded, and content placed below a region that grows on
hydration gets pushed down. The fix is to reserve the lazy region's height so
the swap moves nothing — but on `/ko` the loaded content is shorter than a
viewport, so reserving it leaves visible whitespace on the owner's home
screen. That is a design decision, not a bug fix, so it is in the owner list
below rather than applied here.

## 8. Owner runbook — what no code change can do

In order; each step blocks the next.

1. **Google Search Console.** Add a **domain** property for the production
   host (not a URL-prefix property), verify by DNS TXT in Cloudflare, submit
   `/sitemap.xml`, then inspect one page per locale.
2. **Naver Search Advisor (서치어드바이저).** Register the origin on **https**,
   verify ownership — `app/layout.tsx` already renders
   `naver-site-verification` from the `NAVER_SITE_VERIFICATION` variable, so
   the code half is done — then submit `/sitemap.xml` under 요청 → 사이트맵 제출.
   This is the single highest-value manual step for Korean human traffic.
3. **Bing Webmaster Tools.** Submit `/sitemap.xml`. This matters twice over:
   ChatGPT Search resolves through Bing's index, so a site absent from Bing is
   effectively absent from those citations.
4. **Daum.** Register the site for Korean coverage outside Naver.
5. Only then: watch indexed pages, impressions, CTR and landing pages. None of
   the code in this change can be called effective until those numbers move.

Two performance decisions also need an owner call, both detailed in 7b:
reserving the home screen's lazy region to bring `/ko` back under the CLS
threshold (it costs visible whitespace while loading), and tracking down what
pulls the 2 MB Pretendard face onto every Korean page.

## 9. How each property is proven

| Property | Check |
|---|---|
| Crawlable text per page per locale | `tests/rendered-html.test.mjs` — per-locale floors against the built Worker |
| A visible `<h1>` outside React's hidden stream | same |
| FAQ markup matches displayed text | `tests/page-brief.test.mjs` and `tests/rendered-html.test.mjs` |
| No measurement in evergreen copy | `tests/page-brief.test.mjs` |
| Dataset identifiers are real | `tests/page-brief.test.mjs`, cross-read against `docs/DATA_SOURCES.md` |
| Description width band | `tests/discoverability.test.mjs` and the live checker |
| Robots groups, `*`-scoped | `tests/discoverability.test.mjs`, `tests/rendered-html.test.mjs` |
| robots / sitemap / llms.txt on the live origin | `npm run check:discoverability -- --origin=…` |

The live checker has **not** been run against production in this session: the
environment's egress proxy blocks the production host. Everything above was
verified against the built Worker. Until `npm run check:discoverability` runs
post-deploy, the live state is UNVERIFIED.

## 10. Vendored skills

`.claude/skills/` holds the MIT-licensed SEO/AEO/GEO skills this work was
based on, with provenance and star counts in
`docs/licenses/SEO-SKILL-SOURCES.md`. They are documentation: nothing imports
them, and removing the directory cannot change what the site serves. Where one
conflicts with `CLAUDE.md`, `AGENTS.md` or `docs/ENGINEERING_DIRECTION.md`,
the repository documents win — sections 3 and 6 above are the two conflicts
already resolved.
