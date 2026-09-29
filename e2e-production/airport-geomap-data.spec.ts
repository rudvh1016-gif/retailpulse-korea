import { test } from "@playwright/test";

/**
 * Evidence run, not an assertion: opens the airport's own interactive map and
 * prints which data files it loads and any gate records in them, so gate
 * positions can be read from the official data rather than from pixels.
 */
const MAPS = ["P01", "P02", "P03"];
for (const terminal of MAPS) {
  test(`official geomap data for ${terminal}`, async ({ page }) => {
    test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
    const seen: string[] = [];
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      const url = response.url();
      if (!/json|javascript|xml|text\/plain/.test(type) || !/airport\.kr/.test(url)) return;
      const body = await response.text().catch(() => "");
      const gateHits = (body.match(/(탑승구|게이트|[Gg]ate)[^"]{0,40}/g) ?? []).length;
      seen.push(`${response.status()} ${type.split(";")[0]} ${body.length}B gateHits=${gateHits} ${url.slice(0, 200)}`);
      if (gateHits > 0 && /json|xml|text\/plain/.test(type)) console.log(`GEO ${terminal} BODY ${url.slice(0, 200)}\n${body.slice(0, 6000)}`);
    });
    await page.goto(`https://www.airport.kr/geomap/ap_ko/view.do?alertType=0&tmnlId=${terminal}&type=2`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
    await page.waitForTimeout(8000);
    console.log(`GEO ${terminal} RESPONSES\n${seen.join("\n")}`);
  });
}
