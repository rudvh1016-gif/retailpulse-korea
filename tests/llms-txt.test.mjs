/**
 * The one piece of this work CI could never see.
 *
 * `scripts/build-llms-txt.mjs` writes `dist/client/llms.txt` at build time,
 * and `.github/workflows/ci.yml` sets `RPK_DEPLOYMENT_STAGE: staging` for the
 * whole job — where the script deliberately writes nothing, because a staging
 * origin must not advertise itself. So CI never produced the artifact, no
 * assertion about a file on disk could ever have run there, and the offline
 * render harness cannot see it either: it drives the Worker, and llms.txt is
 * a static asset the Worker never serves.
 *
 * Splitting the content into `lib/llms-txt.ts` as a pure function is what
 * makes it testable at all. These tests are the only thing standing between a
 * broken generator and a 404 nobody notices for weeks.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SITE_ORIGIN ??= "https://koretaildata.com";

const { buildLlmsTxt } = await import("../lib/llms-txt.ts");
const { seoLocales, seoPath, siteOrigin, standaloneSeoSlugs, tourismDeskAreas } = await import("../app/seo-config.ts");
const { activeSourceCatalog } = await import("../lib/source-catalog.ts");

const body = buildLlmsTxt();

/**
 * The same four properties `lib/discoverability.ts` checks against the live
 * origin. Asserting them here too means a broken generator fails in CI rather
 * than after a deploy — the live checker is the backstop, not the gate.
 */
test("llms.txt satisfies the checks the live origin is held to", () => {
  assert.match(body, /^#\s*KORETAIL/m, "no H1");
  assert.match(body, /^>\s*\S/m, "no one-line summary blockquote");
  assert.ok((body.match(/^- \[.+\]\(https:\/\//gm) ?? []).length >= 20, "fewer than 20 page links");
  assert.match(body, /not .*(sales|purchase|queue)/i, "states no truth boundaries");
});

/**
 * A link list is the part of this file that can rot silently: add a page to
 * `standaloneSeoSlugs` and the sitemap, the hreflang set and the live checker
 * all pick it up automatically, but a hand-maintained llms.txt would not.
 * It is generated from the same config, and this is what proves it.
 */
test("every indexable page is listed, on the canonical origin", () => {
  const expected = seoLocales.flatMap((locale) => [
    seoPath(locale),
    ...standaloneSeoSlugs.map((slug) => seoPath(locale, slug)),
    ...tourismDeskAreas.map((area) => seoPath(locale, "tourism-desk", area)),
  ]);
  for (const path of expected) {
    assert.ok(body.includes(`(${siteOrigin}${path})`), `llms.txt does not link ${path}`);
  }

  const linked = [...body.matchAll(/^- \[.+\]\((https:\/\/[^)]+)\)/gm)].map((match) => match[1]);
  const offOrigin = linked.filter((url) => !url.startsWith(siteOrigin));
  assert.deepEqual(offOrigin, [], "llms.txt links a page off the canonical origin");
});

/**
 * The boundaries are the reason this file is worth publishing at all. A link
 * list any crawler could have built itself adds nothing; "this number is not
 * what you would assume" is the part only KORETAIL can supply, and the part
 * that makes a quotation correct rather than merely sourced.
 */
test("the truth boundaries are stated before the page list, not buried after it", () => {
  const boundaries = body.indexOf("## How to quote this site correctly");
  const pages = body.indexOf("## Pages");
  assert.ok(boundaries > 0, "the boundary section is missing entirely");
  assert.ok(boundaries < pages, "the boundaries are below the page list, where a truncating reader never reaches them");

  for (const claim of [
    /not the number of people queueing/i,
    /DOMESTIC card activity/i,
    /not any individual store's revenue/i,
    /no passenger nationality/i,
    /left blank rather than estimated/i,
  ]) {
    assert.match(body, claim, `a boundary that is stated on the site is missing from llms.txt: ${claim}`);
  }
});

test("every source the site collects is named, with what it does not mean", () => {
  for (const row of activeSourceCatalog) {
    assert.ok(body.includes(row.names[1]), `llms.txt omits the source ${row.id}`);
  }
});

/**
 * No clock, no network, no database — so two calls in the same build must
 * produce identical bytes. A generator that varied per invocation would put a
 * spurious change into every deploy and teach anyone diffing it to stop
 * looking.
 */
test("the same build always produces the same bytes", () => {
  assert.equal(buildLlmsTxt(), body);
  assert.doesNotMatch(body, /\d{4}-\d{2}-\d{2}T\d{2}:/, "an embedded timestamp would change on every build");
});
