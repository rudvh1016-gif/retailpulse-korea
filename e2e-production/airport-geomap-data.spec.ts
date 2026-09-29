import { test } from "@playwright/test";

/**
 * Evidence run, not an assertion: opens the airport's own interactive map
 * (the public page https://www.airport.kr/geomap/ap_ko/view.do) and prints,
 * from the map data that page itself loads, every gate point and every point
 * whose official location text names a side, with the map node each one sits
 * on. Gate positions are read from the official map data, never from pixels.
 */
type Node = Record<string, unknown>;
const flat = (node: Node) => Object.fromEntries(Object.entries(node).filter(([, value]) => value === null || typeof value !== "object"));

test("official geomap gate points", async ({ page }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  test.setTimeout(180_000);
  let nodes: { url: string; json: { data?: Record<string, unknown>; creationTime?: string } } | null = null;
  page.on("response", async (response) => {
    if (!/\/API\/v2_0\/nodes\/no-auth\/web\//.test(response.url())) return;
    const json = await response.json().catch(() => null);
    if (json) nodes = { url: response.url(), json };
  });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("https://www.airport.kr/geomap/ap_ko/view.do?alertType=0&tmnlId=P01&type=2", { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
  await page.waitForTimeout(10_000);
  await page.screenshot({ path: "production-visual-results/official-geomap-P01.png" }).catch(() => null);
  if (!nodes) { console.log("GEOMAP NO_NODES_RESPONSE"); return; }
  const { url, json } = nodes as { url: string; json: { data?: Record<string, unknown>; datetime?: string } };
  const data = json.data ?? {};
  console.log(`GEOMAP url ${url} datetime ${json.datetime ?? "?"} keys ${Object.keys(data).join(",")}`);
  const byDbId = new Map<number, { list: string; node: Node }>();
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) { console.log(`GEOMAP key ${key} object ${JSON.stringify(value).slice(0, 300)}`); continue; }
    console.log(`GEOMAP key ${key} length ${value.length} first ${JSON.stringify(value[0]).slice(0, 700)}`);
    if (key === "spoiInfors") continue;
    for (const item of value) if (item && typeof item === "object" && typeof (item as Node).dbId === "number") byDbId.set((item as Node).dbId as number, { list: key, node: item as Node });
  }
  const pois = (data.spoiInfors ?? []) as Node[];
  let printed = 0;
  for (const poi of pois) {
    let ko: { name?: string; locDesc?: string } = {};
    try { ko = (JSON.parse(String(poi.name)) as Array<{ locale: string; name: string; locDesc: string }>).find((row) => row.locale === "ko") ?? {}; } catch { continue; }
    const isGate = /^탑승구\s*\d{1,3}$/.test(String(ko.name ?? "").trim());
    const namesSide = /(동편|서편)/.test(`${ko.name ?? ""} ${ko.locDesc ?? ""}`);
    if (!isGate && !namesSide) continue;
    const at = byDbId.get(Number(poi.nodeDbId));
    const rest = Object.fromEntries(Object.entries(flat(poi)).filter(([key]) => key !== "name" && key !== "imageUrl"));
    console.log(`GEOPOI ${isGate ? "GATE" : "SIDE"} ${JSON.stringify({ ko: ko.name, desc: ko.locDesc, ...rest })} NODE ${at ? `${at.list} ${JSON.stringify(flat(at.node))}` : "none"}`);
    printed++;
  }
  console.log(`GEOMAP printed ${printed} of ${pois.length} points`);
});
