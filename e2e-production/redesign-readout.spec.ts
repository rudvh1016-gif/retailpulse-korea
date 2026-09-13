/**
 * What the redesigned screens actually SAY on the live site, in every locale.
 *
 * The pure-white and composition suites already prove the live pages render.
 * They do not read the two blocks the 2026-09-13 screen work introduced: the
 * airport at-a-glance grid and the Seoul chart's selection readout. A layout
 * that passes every assertion can still clip a Japanese label or wrap a
 * passenger count onto two lines at 390px, and only Korean gets looked at by
 * hand.
 *
 * So: visit all four locales at phone and desktop width, print what each block
 * renders, and fail on the two things a screenshot would be opened to catch —
 * a box whose content overflows it, and a page that scrolls sideways. The
 * printed text goes to the job log, which is readable without downloading the
 * screenshot artifact.
 *
 * Read-only: ordinary public page views, no writes anywhere.
 */
import { test, expect } from "@playwright/test";

const widths = [
  { name: "mobile", width: 390, height: 900 },
  { name: "desktop", width: 1280, height: 1000 },
] as const;

/** A box clips its own text when the content is wider than the box. */
async function overflowing(page: import("@playwright/test").Page, selector: string) {
  return page.locator(selector).evaluateAll(els => els
    .map(el => ({ text: (el.textContent ?? "").trim().slice(0, 60), over: el.scrollWidth - el.clientWidth }))
    .filter(x => x.over > 1));
}

for (const locale of ["ko", "en", "zh", "ja"] as const) {
  for (const viewport of widths) {
    test(`live redesign reads correctly · ${locale} · ${viewport.name}`, async ({ page }, info) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Airport: the three-cell grid.
      await page.goto(`/${locale}/airport`);
      await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
      const strip = page.locator(".airport-glance-strip").first();
      await expect(strip).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const cells = await strip.locator("> div").evaluateAll(els => els.map(el => ({
        label: (el.querySelector("dt")?.textContent ?? "").trim(),
        value: (el.querySelector("dd")?.textContent ?? "").trim(),
      })));
      console.log(`GLANCE ${locale} ${viewport.name} ${JSON.stringify(cells)}`);
      expect(cells.length, "the grid must carry its three questions").toBe(3);
      for (const cell of cells) {
        expect(cell.label.length, "every cell names what it is").toBeGreaterThan(0);
        // Never an empty value: a cell with no data says so in words.
        expect(cell.value.length, `${cell.label} must answer or say it cannot`).toBeGreaterThan(0);
      }
      // The lines under the grid must not reprint a figure the grid already shows.
      const figures = cells.flatMap(c => (c.value.match(/[\d,]{3,}/g) ?? []));
      const support = await page.locator(".airport-current-brief .airport-near-term")
        .evaluateAll(els => els.map(el => (el.textContent ?? "").trim()));
      console.log(`SUPPORT ${locale} ${viewport.name} ${JSON.stringify(support)}`);
      const firstLine = support[0] ?? "";
      for (const figure of figures) {
        expect(firstLine.includes(figure),
          `the first supporting line must not restate the grid figure ${figure}`).toBe(false);
      }
      expect(await overflowing(page, ".airport-glance-strip *"), "no clipped cell").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`airport-${locale}-${viewport.name}.png`) });

      // Seoul: the chart readout above the plot, and the handle on the line.
      await page.goto(`/${locale}/hongdae`);
      await expect(page.locator(".population-chart")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const readout = page.locator(".flow-readout").first();
      await expect(readout).toBeVisible();
      console.log(`READOUT ${locale} ${viewport.name} ${JSON.stringify((await readout.textContent() ?? "").trim())}`);
      // The readout has to sit ABOVE the plot; that is the whole point of moving it.
      const [readoutBox, chartBox] = [await readout.boundingBox(), await page.locator(".population-chart").boundingBox()];
      expect(readoutBox!.y + readoutBox!.height).toBeLessThanOrEqual(chartBox!.y + 1);
      expect(await overflowing(page, ".flow-readout, .flow-head, .flow-notes"), "no clipped chart text").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`seoul-${locale}-${viewport.name}.png`) });
    });
  }
}
