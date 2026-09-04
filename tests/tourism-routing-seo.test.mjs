import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildMetadata,
  pageDescription,
  pageStructuredData,
  pageTitle,
  seoLocales,
  seoPath,
  standaloneSeoSlugs,
  tourismDeskAreas,
} from "../app/seo-config.ts";

test("Tourism Desk has exactly three area routes and no flat indexable slug", () => {
  assert.deepEqual(tourismDeskAreas, ["myeongdong", "hongdae", "seongsu"]);
  assert.equal(standaloneSeoSlugs.includes("tourism-desk"), false);
  assert.deepEqual(
    seoLocales.flatMap((locale) => tourismDeskAreas.map((area) => seoPath(locale, "tourism-desk", area))),
    seoLocales.flatMap((locale) => tourismDeskAreas.map((area) => `/${locale}/tourism-desk/${area}`)),
  );
});

test("each Tourism Desk area has unique localized metadata with area-preserving alternates", () => {
  for (const locale of seoLocales) {
    const titles = tourismDeskAreas.map((area) => pageTitle(locale, "tourism-desk", area));
    const descriptions = tourismDeskAreas.map((area) => pageDescription(locale, "tourism-desk", area));
    assert.equal(new Set(titles).size, tourismDeskAreas.length, `${locale}: titles must be unique`);
    assert.equal(new Set(descriptions).size, tourismDeskAreas.length, `${locale}: descriptions must be unique`);

    for (const area of tourismDeskAreas) {
      const path = `/${locale}/tourism-desk/${area}`;
      const metadata = buildMetadata(locale, "tourism-desk", area);
      assert.equal(metadata.alternates?.canonical, path);
      assert.equal(metadata.openGraph?.url, path);
      assert.equal(metadata.alternates?.languages?.["x-default"], `/en/tourism-desk/${area}`);
      assert.deepEqual(
        new Set(Object.values(metadata.alternates?.languages ?? {}).map(String)),
        new Set(seoLocales.map((language) => `/${language}/tourism-desk/${area}`)),
      );

      const [webPage, breadcrumbs] = pageStructuredData(locale, "tourism-desk", area);
      assert.equal(webPage.url, `${webPage["@id"]}`);
      assert.ok(String(webPage.url).endsWith(path));
      assert.equal(breadcrumbs["@type"], "BreadcrumbList");
      assert.equal(breadcrumbs.itemListElement.at(-1).item, webPage.url);
    }
  }
});

test("the former flat route redirects and only nested Tourism Desk URLs enter the sitemap", async () => {
  const [redirectPage, areaPage, sitemap] = await Promise.all([
    readFile(new URL("../app/[locale]/tourism-desk/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[locale]/tourism-desk/[area]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
  ]);
  assert.match(redirectPage, /permanentRedirect\(`\/\$\{locale\}\/tourism-desk\/myeongdong`\)/);
  assert.match(areaPage, /tourismDeskAreas\.map/);
  assert.match(areaPage, /initialView="tourism-desk"/);
  assert.match(sitemap, /standaloneSeoSlugs\.map/);
  assert.match(sitemap, /tourismDeskAreas\.map/);
  assert.match(sitemap, /tourism-desk\/\$\{area\}/);
});
