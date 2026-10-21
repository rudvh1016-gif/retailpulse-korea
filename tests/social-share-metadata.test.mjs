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

test("all locale cards show the brand and owner-approved service description while preserving page SEO", () => {
  for (const locale of seoLocales) {
    for (const slug of [undefined, "airport", "myeongdong", "business", "tourism-desk"]) {
      const metadata = buildMetadata(locale, slug);
      assert.equal(metadata.title, pageTitle(locale, slug));
      assert.equal(metadata.description, pageDescription(locale, slug));
      assert.equal(metadata.openGraph.title, "KORETAIL");
      assert.equal(metadata.openGraph.description, "인천공항 출발·도착 항공편, 시간대별 예상 여객과 국가별 여객 추이, 환율·입국 면세 정보를 확인하세요. 자료별 기준일과 출처를 함께 제공합니다.");
      assert.equal(metadata.openGraph.images[0].url, socialImage.url);
      assert.equal(metadata.twitter.title, "KORETAIL");
      assert.equal(metadata.twitter.description, metadata.openGraph.description);
      assert.equal(metadata.twitter.images[0], socialImage.url);
      assert.match(String(metadata.alternates.canonical), /^\//);
    }
  }
});
