import { test, expect } from "@playwright/test";
import { routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";
const WITH_TRANSFER = { ...SUMMARY_FIXTURE, airport: { ...SUMMARY_FIXTURE.airport, transferForecast: [
  { terminal: "T1", serviceDate: "2026-08-31", expectedTransferPassengers: 559, retrievedAt: "2026-08-30T08:10:00Z" },
  { terminal: "T2", serviceDate: "2026-08-31", expectedTransferPassengers: 10485, retrievedAt: "2026-08-30T08:10:00Z" },
] } };
test("mobile probe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/live/summary**", routeSummary(WITH_TRANSFER));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  // What is actually fixed to the bottom?
  console.log("FIXED " + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *")]
    .filter(el => { const s = getComputedStyle(el); return (s.position === "fixed" || s.position === "sticky") && el.getBoundingClientRect().height > 0; })
    .map(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { cls: el.className?.toString().slice(0, 36), pos: s.position, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; }))));
  // Who overflows .airport-view?
  console.log("OVER " + JSON.stringify(await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>(".airport-view"); if (!host) return null;
    const hostRight = host.getBoundingClientRect().right;
    return [...host.querySelectorAll<HTMLElement>("*")]
      .map(el => ({ cls: el.className?.toString().slice(0, 40), right: Math.round(el.getBoundingClientRect().right), ox: getComputedStyle(el).overflowX }))
      .filter(x => x.right > hostRight + 1).slice(0, 5);
  })));
  // Scroll to the true bottom and see whether anything is hidden behind a fixed bar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  console.log("TAIL " + JSON.stringify(await page.evaluate(() => {
    const fixedBottom = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return s.position === "fixed" && r.height > 0 && r.bottom >= window.innerHeight - 2; })
      .map(el => el.getBoundingClientRect().top).sort((a, b) => a - b)[0] ?? null;
    const texts = [...document.querySelectorAll<HTMLElement>("main *, .app *")]
      .filter(el => el.children.length === 0 && (el.textContent ?? "").trim().length > 2);
    const last = texts.at(-1);
    const r = last?.getBoundingClientRect();
    return { fixedBottomTop: fixedBottom, lastText: (last?.textContent ?? "").trim().slice(0, 40),
      lastBottom: r ? Math.round(r.bottom) : null, innerHeight: window.innerHeight,
      hidden: fixedBottom !== null && r ? Math.round(r.bottom - fixedBottom) : null };
  })));
});
