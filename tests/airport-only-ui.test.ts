import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { airportOnlyDestination, retiredSeoulSlugs } from "../app/airport-only-routes";
import sitemap from "../app/sitemap";

test("all four locales retire Seoul routes without carrying shared area or date parameters", () => {
  for (const locale of ["ko", "en", "zh", "ja"]) {
    for (const slug of retiredSeoulSlugs) assert.equal(airportOnlyDestination(locale, slug), `/${locale}`);
    for (const slug of ["airport", "airport-countries", "airport-prepare", "airport-glance", "more", "about", "business"]) assert.equal(airportOnlyDestination(locale, slug), null);
  }
});
test("sitemap advertises only airport and shared service pages", () => {
  for (const page of sitemap()) {
    const slug = new URL(page.url).pathname.split("/")[2];
    assert.equal(airportOnlyDestination("ko", slug), null, page.url);
    assert.ok(!page.url.includes("tourism-desk"));
  }
});
test("server route retires before summary or today-answer reads; history navigation cannot remount Seoul", () => {
  const route = readFileSync(new URL("../app/[locale]/[slug]/page.tsx", import.meta.url), "utf8");
  assert.ok(route.indexOf("if (retiredDestination) permanentRedirect") < route.indexOf("const todayAnswer ="));
  const shell = readFileSync(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  assert.ok(shell.includes("window.location.replace(retired)"));
  assert.ok(!shell.includes("['where-to','today','consumption','business','tourism-desk','forecast','about'] as const"));
});
