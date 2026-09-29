import { test } from "@playwright/test";

/**
 * Evidence run, not an assertion: opens the airport's own interactive map
 * (the public page https://www.airport.kr/geomap/ap_ko/view.do) and prints the
 * gate points that the map itself loads, with their map coordinates, so gate
 * positions are read from the official map data rather than from pixels.
 * Nothing is sent anywhere; the map is opened exactly as a visitor opens it.
 */
type Node = Record<string, unknown>;
function walk(value: unknown, visit: (node: Node, path: string) => void, path = "$") {
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
  else if (value && typeof value === "object") {
    visit(value as Node, path);
    for (const [key, child] of Object.entries(value as Node)) walk(child, visit, `${path}.${key}`);
  }
}
const NAME = /^(탑승구\s*\d{1,3}|출국장\s*\d.*|.*(동편|서편).*)$/;

test("official geomap gate points", async ({ page }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  test.setTimeout(180_000);
  const bodies: Array<{ url: string; json: unknown }> = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!/icnmap\.airport\.kr|icnplus\.airport\.kr/.test(url) || !/json|text\/plain/.test(response.headers()["content-type"] ?? "")) return;
    const json = await response.json().catch(() => null);
    if (json) bodies.push({ url, json });
  });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("https://www.airport.kr/geomap/ap_ko/view.do?alertType=0&tmnlId=P01&type=2", { waitUntil: "networkidle", timeout: 90_000 }).catch(() => null);
  await page.waitForTimeout(10_000);
  await page.screenshot({ path: "production-visual-results/official-geomap-P01.png" }).catch(() => null);
  for (const { url, json } of bodies) {
    const hits: string[] = [];
    const shapes = new Set<string>();
    walk(json, (node, path) => {
      const name = Object.values(node).find((value) => typeof value === "string" && NAME.test(value.trim()));
      if (!name) return;
      const flat = Object.fromEntries(Object.entries(node).filter(([, value]) => value === null || typeof value !== "object"));
      const nested = Object.entries(node).filter(([, value]) => value && typeof value === "object").map(([key, value]) => `${key}:${JSON.stringify(value).slice(0, 160)}`);
      shapes.add(path.replace(/\[\d+\]/g, "[]"));
      hits.push(`${JSON.stringify(flat)} ${nested.join(" ")}`);
    });
    if (!hits.length) continue;
    console.log(`GEOPTS ${url.slice(0, 160)} hits=${hits.length} paths=${[...shapes].join(",")}`);
    for (const hit of hits.slice(0, 700)) console.log(`GEOPT ${hit.slice(0, 600)}`);
  }
});
