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
