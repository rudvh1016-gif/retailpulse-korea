/**
 * PR #357 made /{lang} render the airport glance, so /{lang}/airport-glance
 * serves the same page. One canonical: the home. The glance URL names it,
 * shares its hreflang cluster and structured data, and the home carries the
 * approved glance title and description instead of the retired briefing copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.RPK_DEPLOYMENT_STAGE = "production";
const { buildMetadata, pageStructuredData, pageTitle, pageDescription, seoLocales, canonicalSlug } = await import("../app/seo-config.ts");

test("the airport glance URL names the home as canonical in every locale", () => {
  for (const locale of seoLocales) {
    const glance = buildMetadata(locale, "airport-glance");
    const home = buildMetadata(locale);
    assert.equal(glance.alternates.canonical, `/${locale}`);
    assert.deepEqual(glance.alternates.languages, home.alternates.languages, "one hreflang cluster, the home's");
    assert.equal(glance.title, home.title);
    assert.equal(glance.description, home.description);
    assert.deepEqual(pageStructuredData(locale, "airport-glance"), pageStructuredData(locale));
  }
  assert.equal(canonicalSlug("airport-glance"), undefined);
  assert.equal(canonicalSlug("airport"), "airport", "the airport screen is its own page");
});

test("the home describes the airport glance it shows, with the approved glance copy", () => {
  for (const locale of seoLocales) {
    assert.equal(pageTitle(locale), pageTitle(locale, "airport-glance"));
    assert.equal(pageDescription(locale), pageDescription(locale, "airport-glance"));
  }
  assert.doesNotMatch(pageDescription("ko"), /역할과 관심지역|내 브리핑/, "the retired role picker is not described");
  assert.doesNotMatch(pageDescription("en"), /personal briefing/);
});

test("site structured data is WebSite only, and the client keeps the server's canonical", async () => {
  const [layout, app] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8"),
  ]);
  const code = layout.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.match(code, /"@type": "WebSite",/);
  assert.doesNotMatch(code, /WebApplication|applicationCategory|operatingSystem/,
    "Google shows software-app results only with ratings or reviews this site does not have");
  assert.match(app, /const canonical = canonicalSlug\(slug\);/,
    "the head effect must not rewrite the glance canonical back to itself after hydration");
});
