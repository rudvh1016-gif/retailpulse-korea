import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildMetadata, pageDescription, pageTitle, seoLocales, socialImage } from "../app/seo-config.ts";

test("approved shared card is absolute, versioned and serves the committed JPEG", async () => {
  const url = new URL(socialImage.url);
  assert.match(url.protocol, /^https?:$/);
  assert.equal(url.pathname, "/og-airport-b-20261004.jpg");
  assert.equal(socialImage.width, 1200);
  assert.equal(socialImage.height, 630);
  assert.equal(socialImage.type, "image/jpeg");
  assert.equal(socialImage.alt, "KORETAIL");

  const image = await readFile(new URL("../public/og-airport-b-20261004.jpg", import.meta.url));
  assert.ok(image.length > 30_000 && image.length < 150_000);
  assert.equal(image.subarray(0, 3).toString("hex"), "ffd8ff");
});

test("all locale cards show only the brand while preserving page SEO", () => {
  for (const locale of seoLocales) {
    for (const slug of [undefined, "airport", "myeongdong", "business", "tourism-desk"]) {
      const metadata = buildMetadata(locale, slug);
      assert.equal(metadata.title, pageTitle(locale, slug));
      assert.equal(metadata.description, pageDescription(locale, slug));
      assert.equal(metadata.openGraph.title, "KORETAIL");
      assert.equal(metadata.openGraph.description.trim(), "");
      assert.equal(metadata.openGraph.images[0].url, socialImage.url);
      assert.equal(metadata.twitter.title, "KORETAIL");
      assert.equal(metadata.twitter.description.trim(), "");
      assert.equal(metadata.twitter.images[0], socialImage.url);
      assert.match(String(metadata.alternates.canonical), /^\//);
    }
  }
});
