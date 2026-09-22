/**
 * Does every page still say something when JavaScript never runs?
 *
 * On 2026-09-22 the built Worker was rendered and the crawlable text in the
 * first HTML response was counted: `/ko` carried 318 characters, `/zh` 263,
 * `/ko/myeongdong` 350. Twenty-two of the forty indexable pages sat under 600
 * characters and twenty-eight served a localized "로딩 중" where their content
 * belongs, because everything on those screens arrives from a client fetch
 * that a non-JavaScript crawler never performs.
 *
 * `lib/page-brief.ts` and `app/page-brief.tsx` are the fix. These tests are
 * what stops it quietly regressing — a brief is easy to delete, easy to leave
 * off a new page, and easy to let drift out of step with the JSON-LD that
 * claims to mirror it.
 *
 * No network, no database, no build output: this file reads the copy module
 * directly, so it runs in the unit suite. The companion assertions that need
 * real rendered HTML live in tests/rendered-html.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SITE_ORIGIN ??= "https://koretaildata.com";

const { seoLocales, standaloneSeoSlugs, tourismDeskAreas, areaNames } = await import("../app/seo-config.ts");
const { pageBrief, faqStructuredData, localize, BRIEF_LABELS } = await import("../lib/page-brief.ts");
const { activeSourceCatalog } = await import("../lib/source-catalog.ts");

/** Every page that can be reached from the sitemap, as (slug, area) pairs. */
function everyBriefablePage() {
  return [
    { slug: undefined, area: "myeongdong", label: "/{locale}" },
    ...standaloneSeoSlugs.map((slug) => ({ slug, area: "myeongdong", label: `/{locale}/${slug}` })),
    ...tourismDeskAreas.map((area) => ({ slug: "tourism-desk", area, label: `/{locale}/tourism-desk/${area}` })),
  ];
}

test("every indexable page has a brief, in all four languages", () => {
  for (const { slug, area, label } of everyBriefablePage()) {
    const brief = pageBrief(slug, area);
    assert.ok(brief, `${label} has no brief — it would ship as an empty shell to every non-JS crawler`);
    assert.ok(brief.answers.length >= 3, `${label} lists only ${brief.answers.length} things it answers`);
    assert.ok(brief.faq.length >= 2, `${label} carries only ${brief.faq.length} questions`);
    assert.ok(brief.sources.length >= 1, `${label} names no source`);

    for (const words of [brief.heading, brief.intro, ...brief.answers, ...brief.faq.flatMap((entry) => [entry.question, entry.answer])]) {
      assert.equal(words.length, 4, `${label} has a string that is not four-language: ${JSON.stringify(words)}`);
      for (const [index, locale] of seoLocales.entries()) {
        assert.ok(words[index]?.trim().length > 0, `${label} is missing its ${locale} copy for ${JSON.stringify(words)}`);
      }
      // Four identical strings means three locales were never written.
      assert.ok(new Set(words).size > 1, `${label} repeats one string across all four locales: ${words[0]}`);
    }
  }
});

test("every source a brief names actually exists in the catalog", () => {
  const known = new Set(activeSourceCatalog.map((row) => row.id));
  for (const { slug, area, label } of everyBriefablePage()) {
    for (const id of pageBrief(slug, area).sources) {
      assert.ok(known.has(id), `${label} names ${id}, which is not in activeSourceCatalog — it would render as a blank row`);
    }
  }
});

/**
 * The brief explains; it never reports.
 *
 * Every real figure on this site is live, is labelled with the moment it was
 * retrieved, and can be absent. A number written into constant copy would be
 * a measurement frozen at authoring time and presented as current — the exact
 * fabrication `AGENTS.md` forbids, and the most likely way this file turns
 * from an asset into a liability.
 *
 * Grouped thousands and any run of four or more digits are what a count looks
 * like ("47,320명", "2026년 실적"). Short numbers stay allowed, because T1, T2,
 * 15분 and 28일 are names and cadences, not measurements.
 */
test("no brief states a measurement", () => {
  const looksLikeACount = /\d{1,3}(,\d{3})+|\d{4,}/;
  for (const { slug, area, label } of everyBriefablePage()) {
    const brief = pageBrief(slug, area);
    const everyString = [brief.heading, brief.intro, ...brief.answers, ...brief.faq.flatMap((entry) => [entry.question, entry.answer])].flat();
    for (const text of everyString) {
      assert.doesNotMatch(text, looksLikeACount,
        `${label} writes what reads as a measurement into constant copy: "${text}"`);
    }
  }
});

/**
 * The anti-cloaking invariant, and the reason the JSON-LD is generated rather
 * than hand-written.
 *
 * Structured data that claims a question and answer the page does not display
 * is the textbook route to a manual action, and the usual cause is a second
 * hand-maintained copy drifting from the first. `faqStructuredData` and
 * `app/page-brief.tsx` read the same array, and this test is what proves that
 * stays true — including for anyone who later "optimizes" the JSON-LD copy.
 */
test("FAQPage JSON-LD says exactly what the page displays", () => {
  for (const locale of seoLocales) {
    for (const { slug, area, label } of everyBriefablePage()) {
      const brief = pageBrief(slug, area);
      const jsonLd = faqStructuredData(locale, slug, area);
      assert.ok(jsonLd, `${label} (${locale}) has questions but emits no FAQPage`);
      assert.equal(jsonLd["@type"], "FAQPage");
      assert.equal(jsonLd.mainEntity.length, brief.faq.length,
        `${label} (${locale}) marks up ${jsonLd.mainEntity.length} questions but shows ${brief.faq.length}`);

      for (const [index, entry] of brief.faq.entries()) {
        const node = jsonLd.mainEntity[index];
        assert.equal(node["@type"], "Question");
        assert.equal(node.name, localize(locale, entry.question),
          `${label} (${locale}) marks up a question the page does not show`);
        assert.equal(node.acceptedAnswer.text, localize(locale, entry.answer),
          `${label} (${locale}) marks up an answer the page does not show`);
      }
    }
  }
});

/**
 * A search engine that finds the same paragraph on forty URLs treats
 * thirty-nine of them as duplicates. The shared questions — pricing, how a
 * forecast differs from a record — are deliberately reused, but the sentence
 * that says what THIS page is for has to be the page's own.
 */
test("each page's intro is unique, so the four locales do not compete as duplicates", () => {
  for (const locale of seoLocales) {
    const seen = new Map();
    for (const { slug, area, label } of everyBriefablePage()) {
      const intro = localize(locale, pageBrief(slug, area).intro);
      const previous = seen.get(intro);
      assert.equal(previous, undefined, `${label} and ${previous} ship the same ${locale} intro`);
      seen.set(intro, label);
    }
  }
});

test("the shared sub-headings are translated, not left in one language", () => {
  for (const words of Object.values(BRIEF_LABELS)) {
    assert.equal(words.length, 4);
    assert.equal(new Set(words).size, 4, `a BRIEF_LABELS entry repeats a string: ${JSON.stringify(words)}`);
  }
});

/**
 * The area pages are three copies of one template, which is fine only while
 * each one actually names its own district. A templating bug that dropped the
 * substitution would leave three identical pages and a literal "{}".
 */
test("an area brief names its own area, in that area's own language", () => {
  for (const area of Object.keys(areaNames)) {
    const brief = pageBrief(area, area);
    for (const [index, locale] of seoLocales.entries()) {
      const intro = brief.intro[index];
      assert.ok(intro.includes(areaNames[area][locale]),
        `the ${locale} intro for ${area} never names ${areaNames[area][locale]}`);
      assert.doesNotMatch(intro, /\{\}/, `the ${locale} intro for ${area} left an unsubstituted slot`);
    }
  }
});

/**
 * A citation nobody checked is worse than no citation.
 *
 * `lib/source-catalog.ts` now links each source to its publisher's catalogue
 * entry, which is the first thing an answer engine looks for when deciding
 * whether to trust a republisher — and the easiest thing in this change to
 * get plausibly, invisibly wrong. A dataset number is eight digits; one wrong
 * digit is a confident link to somebody else's data, or to a 404, and nothing
 * on the page would look amiss.
 *
 * So the identifiers are not trusted on their own: every one is checked
 * against `docs/DATA_SOURCES.md`, the repository's own verified source matrix,
 * where each was recorded with the date its contract was confirmed. Adding a
 * source here without adding it there fails.
 */
test("every dataset identifier a page cites is one docs/DATA_SOURCES.md records", async () => {
  const { readFile } = await import("node:fs/promises");
  const { sourceProvenance } = await import("../lib/source-catalog.ts");
  const matrix = await readFile(new URL("../docs/DATA_SOURCES.md", import.meta.url), "utf8");

  for (const [id, provenance] of Object.entries(sourceProvenance)) {
    assert.ok(activeSourceCatalog.some((row) => row.id === id),
      `sourceProvenance names ${id}, which is not a source this product collects`);

    // The catalogue number inside the identifier string, if it has one.
    const number = /(\d{8})|((?:OA|B)-?\d+)/.exec(provenance.identifier)?.[0];
    if (number) {
      assert.ok(matrix.includes(number),
        `${id} cites ${number}, which does not appear in docs/DATA_SOURCES.md — a dataset number nobody verified`);
    }

    if (provenance.url) {
      assert.match(provenance.url, /^https:\/\//, `${id} cites a non-HTTPS URL`);
      const host = new URL(provenance.url).host;
      assert.ok(matrix.includes(host),
        `${id} links ${host}, a host docs/DATA_SOURCES.md never names`);
      // A deep link has to point at the dataset the identifier names.
      if (number && provenance.url.includes("/data/")) {
        assert.ok(provenance.url.includes(number),
          `${id} says ${number} but links somewhere else: ${provenance.url}`);
      }
    }
  }
});

/**
 * Nothing on this site linked outward before 2026-09-22. Naming an
 * institution in prose is not a citation a reader can follow or a crawler can
 * resolve, and every source row on every page should carry one.
 */
test("every source a brief shows can be traced to its publisher", async () => {
  const { sourceProvenance } = await import("../lib/source-catalog.ts");
  const cited = new Set();
  for (const { slug, area } of everyBriefablePage()) for (const id of pageBrief(slug, area).sources) cited.add(id);

  for (const id of cited) {
    assert.ok(sourceProvenance[id], `${id} is shown to readers with no provenance at all`);
    assert.ok(sourceProvenance[id].identifier.trim().length > 0, `${id} has an empty identifier`);
  }
});
