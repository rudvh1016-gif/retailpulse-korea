import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { airportOnlyDestination, retiredSeoulSlugs } from "../app/airport-only-routes";
import sitemap from "../app/sitemap";

test("all four locales retire Seoul routes without carrying retired Seoul parameters", () => {
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

test("retired redirects preserve only one valid calendar date across all locales", () => {
 for (const locale of ["ko", "en", "zh", "ja"]) for (const slug of retiredSeoulSlugs) {
  for (const date of ["2026-08-31", "2024-02-29", "2027-01-01"]) assert.equal(airportOnlyDestination(locale, slug, date), `/${locale}?date=${date}`);
  for (const date of [undefined, null, "", "2026-02-29", "2026-13-01", "2026-08-32", "2026-8-01", "2026-08-31&area=hongdae", ["2026-08-31"], ["2026-08-31", "2026-09-01"]]) assert.equal(airportOnlyDestination(locale, slug, date), `/${locale}`);
 }
 assert.equal(airportOnlyDestination("ko", "airport", "2026-08-31"), null);
});
test("server and history redirect paths validate date while canonical metadata stays query-free", () => {
 const root = readFileSync(new URL("../app/[locale]/[slug]/page.tsx", import.meta.url), "utf8");
 assert.match(root,/airportOnlyDestination\(locale, slug, \(await searchParams\)\?\.date\)/);
 assert.match(root,/const destination = airportOnlyDestination\(locale, slug\)/);
 for(const path of ["../app/[locale]/tourism-desk/page.tsx", "../app/[locale]/tourism-desk/[area]/page.tsx"]) {
  const source=readFileSync(new URL(path,import.meta.url),"utf8");
  assert.match(source,/airportOnlyDestination\(locale, "tourism-desk", \(await searchParams\)\?\.date\)/);
 }
 const shell=readFileSync(new URL("../app/retailpulse-app.tsx",import.meta.url),"utf8");
 assert.ok(shell.includes('query.getAll("date").length === 1'));
});

import {NextRequest} from 'next/server';
import {proxy} from '../proxy';
test('request proxy preserves one valid date before adapter rendering and drops Seoul query fields',()=>{
 for(const locale of ['ko','en','zh','ja'])for(const slug of [...retiredSeoulSlugs,'tourism-desk/hongdae']){
  const request=new NextRequest(`https://example.test/${locale}/${slug}?area=hongdae&category=food&date=2026-10-01`);
  assert.equal(request.nextUrl.searchParams.get('date'),'2026-10-01');
  const result=proxy(request);
  assert.equal(result.status,308);
  assert.equal(result.headers.get('location'),`https://example.test/${locale}?date=2026-10-01`);
 }
 for(const query of ['date=2026-02-29','date=2026-10-01&date=2026-10-02','area=hongdae','date=invalid']) {
  assert.equal(proxy(new NextRequest(`https://example.test/ko/myeongdong?${query}`)).headers.get('location'),'https://example.test/ko');
 }
 for(const path of ['/ko/airport?date=2026-10-01','/ko/business?place=airport&terminal=T2','/fr/myeongdong?date=2026-10-01','/ko/myeongdong/unknown']) {
  const result=proxy(new NextRequest(`https://example.test${path}`));
  assert.equal(result.headers.get('location'),null,path);
  assert.equal(result.headers.get('x-middleware-next'),'1',path);
 }
 assert.equal(proxy(new NextRequest('https://example.test/?date=2026-10-01')).headers.get('location'),'https://example.test/ko?date=2026-10-01');
});
