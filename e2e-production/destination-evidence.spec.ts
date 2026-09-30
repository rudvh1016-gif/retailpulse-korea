import { test } from "@playwright/test";

/**
 * Evidence run, not an assertion (manual dispatch only, like the gate-map run).
 *
 * 1. Which destination values the stored departure records actually carry,
 *    read through the public flights API for the last seven KST days. The
 *    destination table (config/airport-destinations.v1.json) is built from
 *    these values only, never from a world airport list.
 * 2. The airport's own pages that list destinations by country and publish
 *    notices, so each entry can cite a first-party page.
 */
const kstDay = (offsetDays: number) => new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

test("destination values in the stored departures", async ({ request }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  test.setTimeout(120_000);
  const counts = new Map<string, { flights: number; days: Set<string>; sample: string }>();
  for (let offset = -7; offset <= 0; offset++) {
    const day = kstDay(offset);
    const body = await (await request.get(`/api/live/flights?date=${day}`)).json().catch(() => null);
    const rows = (body?.flights ?? []) as Array<Record<string, unknown>>;
    const departures = rows.filter((row) => row.direction === "departure");
    console.log(`DEST-DAY ${day} mode ${body?.mode} basis ${body?.basis} rows ${rows.length} departures ${departures.length} truncated ${body?.truncated}`);
    for (const row of departures) {
      const key = String(row.airportCode ?? "(null)");
      const entry = counts.get(key) ?? { flights: 0, days: new Set<string>(), sample: `${row.flightNumber} ${row.airlineCode} ${row.terminal} ${row.gate}` };
      entry.flights++;
      entry.days.add(day);
      counts.set(key, entry);
    }
  }
  for (const [code, entry] of [...counts].sort((a, b) => b[1].flights - a[1].flights)) {
    console.log(`DEST ${JSON.stringify({ code, flights: entry.flights, days: entry.days.size, sample: entry.sample })}`);
  }
  console.log(`DEST-TOTAL distinct ${counts.size}`);
});

test("airport.kr pages that list destinations and notices", async ({ page }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  test.setTimeout(180_000);
  for (const url of ["https://www.airport.kr/ap_ko/index.do", "https://www.airport.kr/ap_ko/sitemap.do"]) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    await page.waitForTimeout(3_000);
    const links = await page.evaluate(() => Array.from(document.querySelectorAll("a"))
      .map((a) => ({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim(), href: a.href }))
      .filter((link) => /취항|공지|운항|노선|도시|항공사|목적지|변경|알림/.test(link.text)));
    console.log(`SITE ${url} title ${await page.title().catch(() => "?")} links ${links.length}`);
    for (const link of links.slice(0, 120)) console.log(`SITE-LINK ${JSON.stringify(link)}`);
  }
});

test("airport.kr route map and notice board contents", async ({ page }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  test.setTimeout(240_000);
  const json: Array<{ url: string; body: string }> = [];
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!/json|javascript|text\/plain/.test(type) || /\.js(\?|$)/.test(response.url())) return;
    const body = await response.text().catch(() => "");
    if (body && body.length < 400_000) json.push({ url: response.url(), body });
  });
  for (const url of ["https://www.airport.kr/ap_ko/6600/subview.do", "https://www.airport.kr/ap_ko/1011/subview.do"]) {
    json.length = 0;
    await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
    await page.waitForTimeout(6_000);
    const text = await page.evaluate(() => (document.querySelector("#contents, #content, main, .contents, body") as HTMLElement | null)?.innerText ?? "");
    console.log(`PAGE ${url} title ${await page.title().catch(() => "?")} textLength ${text.length}`);
    for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 700)) console.log(`PAGE-TEXT ${line.slice(0, 200)}`);
    const links = await page.evaluate(() => Array.from(document.querySelectorAll("a")).map((a) => ({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim(), href: a.href }))
      .filter((link) => link.text && /artclView|subview|view\.do|\/bbs\//.test(link.href)).slice(0, 80));
    for (const link of links) console.log(`PAGE-LINK ${JSON.stringify(link)}`);
    for (const response of json.slice(0, 12)) console.log(`PAGE-XHR ${response.url} ${response.body.slice(0, 3000).replace(/\s+/g, " ")}`);
    await page.screenshot({ path: `production-visual-results/airportkr-${url.split("/")[4]}.png`, fullPage: true }).catch(() => null);
  }
});

test("airport.kr flight-status destination picker, notice feed and terms", async ({ page, request }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  test.setTimeout(300_000);
  const bodies: Array<{ url: string; body: string }> = [];
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!/json|xml|text\/plain/.test(type)) return;
    const body = await response.text().catch(() => "");
    if (body) bodies.push({ url: response.url(), body });
  });
  await page.goto("https://www.airport.kr/ap_ko/869/subview.do", { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
  await page.waitForTimeout(8_000);
  const selects = await page.evaluate(() => Array.from(document.querySelectorAll("select")).map((select) => ({
    name: select.name || select.id, options: Array.from(select.querySelectorAll("option, optgroup")).map((o) => o.tagName === "OPTGROUP" ? `[${(o as HTMLOptGroupElement).label}]` : `${(o as HTMLOptionElement).value}=${o.textContent?.trim()}`),
  })));
  for (const select of selects) console.log(`FS-SELECT ${select.name} ${select.options.length} ${JSON.stringify(select.options).slice(0, 12000)}`);
  const lists = await page.evaluate(() => Array.from(document.querySelectorAll("[class*=airport], [class*=city], [id*=airport], [id*=city], ul[class*=list]"))
    .map((node) => (node as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 3000)).filter((text) => text.length > 40).slice(0, 10));
  for (const text of lists) console.log(`FS-LIST ${text}`);
  for (const body of bodies) if (!/tempPwd|userInfoCheck|popup|imageSlide/.test(body.url)) console.log(`FS-XHR ${body.url} ${body.body.slice(0, 20000).replace(/\s+/g, " ")}`);
  await page.screenshot({ path: "production-visual-results/airportkr-869.png", fullPage: true }).catch(() => null);

  // The notice board's own feed and the urgent-notice banner data.
  await page.goto("https://www.airport.kr/ap_ko/1011/subview.do", { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
  const feed = await page.evaluate(() => Array.from(document.querySelectorAll("a")).find((a) => /RSS/.test(a.textContent ?? ""))?.href ?? null);
  const detail = await page.evaluate(() => Array.from(document.querySelectorAll("a")).filter((a) => /artclView/.test(a.href)).map((a) => a.href).slice(0, 6));
  console.log(`NOTICE-FEED ${feed} DETAIL ${JSON.stringify(detail)}`);
  if (feed) {
    const rss = await request.get(feed).then((r) => r.text()).catch(() => "");
    console.log(`NOTICE-RSS ${rss.slice(0, 12000).replace(/\s+/g, " ")}`);
  }
  const slides = await request.get("https://www.airport.kr/imageSlide/ap_ko/91/getJsonImageSlideArtclList.do").then((r) => r.text()).catch(() => "");
  console.log(`NOTICE-SLIDES ${slides.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 12000)}`);
  for (const href of detail.slice(0, 3)) {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    const text = await page.evaluate(() => ((document.querySelector(".artclView, .view-con, #contents, #content") as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " "));
    const kogl = await page.evaluate(() => Array.from(document.querySelectorAll("img, a")).map((n) => `${(n as HTMLImageElement).alt ?? ""} ${(n as HTMLAnchorElement).href ?? ""}`).filter((t) => /공공누리|kogl|저작권/i.test(t)).slice(0, 5));
    console.log(`NOTICE-DETAIL ${href} KOGL ${JSON.stringify(kogl)} TEXT ${text.slice(0, 1500)}`);
  }
  // Terms of use and copyright policy of the site.
  await page.goto("https://www.airport.kr/ap_ko/index.do", { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
  const terms = await page.evaluate(() => Array.from(document.querySelectorAll("a")).filter((a) => /이용약관|저작권/.test(a.textContent ?? "")).map((a) => a.href));
  console.log(`TERMS-LINKS ${JSON.stringify(terms)}`);
  for (const href of terms.slice(0, 2)) {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    const text = await page.evaluate(() => ((document.querySelector("#contents, #content, main") as HTMLElement | null)?.innerText ?? document.body.innerText).replace(/\s+/g, " "));
    const hits = text.split(/(?<=[.。])\s/).filter((s) => /저작|복제|전재|배포|출처|상업|무단|공공누리|이용 ?허락/.test(s)).slice(0, 30);
    console.log(`TERMS ${href} length ${text.length}`);
    for (const hit of hits) console.log(`TERMS-HIT ${hit.slice(0, 400)}`);
  }
});
