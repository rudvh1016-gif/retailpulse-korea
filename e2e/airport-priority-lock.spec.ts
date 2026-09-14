/**
 * OWNER PRIORITY LOCK — airport executive brief, 2026-09-14.
 *
 * The owner set this reading order after using the screen, and it is the order
 * an airport retail manager plans a shift in:
 *
 *   1 arithmetic sum of the two forecasts   5 this hour / peak / vs last week
 *   2 the sum shown as arithmetic           6 month to date
 *   3 the limitation on that sum            7 previous month's same span
 *   4 today's hourly forecast chart         8 daily bars + running total
 *                                           9 queue   10 flights   11 detail
 *
 * The specific regression this exists to catch: the departure hall's own
 * figure climbing back above the sum. It led this view once, and it is one of
 * the two operands — a reader cannot tell a part from a whole when the part is
 * the biggest number on the screen. So the test asserts real rendered geometry
 * (getBoundingClientRect) and DOM order, not just that the blocks exist.
 */
import { test, expect } from "@playwright/test";
import { routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";

/**
 * The base fixture publishes no transfer forecast, so the sum cannot be formed
 * and the hall figure correctly leads instead. This lock is about the screen
 * WHEN the sum exists, so the transfer rows are supplied — the same two values
 * e2e/passenger-truth.spec.ts uses: 47,320 + 11,044 = 58,364.
 */
const WITH_TRANSFER = {
  ...SUMMARY_FIXTURE,
  airport: {
    ...SUMMARY_FIXTURE.airport,
    transferForecast: [
      { terminal: "T1", serviceDate: "2026-08-31", expectedTransferPassengers: 559, retrievedAt: "2026-08-30T08:10:00Z" },
      { terminal: "T2", serviceDate: "2026-08-31", expectedTransferPassengers: 10485, retrievedAt: "2026-08-30T08:10:00Z" },
    ],
  },
};
import { passengerCopy } from "../lib/passenger-copy";
import { mtdCopy } from "../lib/airport-mtd-copy";

const ORDER = [
  '[data-testid="airport-sum-total"]',
  '[data-testid="airport-sum-formula"]',
  ".passenger-transfer-limitation",
  ".airport-forecast",
  ".airport-glance-strip",
  '[data-testid="airport-mtd"]',
  ".airport-month-chart",
] as const;

for (const lang of ["ko", "en", "zh", "ja"] as const) {
  for (const width of [390, 1280]) {
    test(`airport priority lock holds · ${lang} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route("**/api/live/summary**", routeSummary(WITH_TRANSFER));
      await page.goto(`/${lang}/airport`);
      await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

      // 1-3: the sum leads, is shown as arithmetic, and carries its limitation.
      const total = page.locator('[data-testid="airport-sum-total"]');
      await expect(total).toBeVisible();
      await expect(total).toContainText(passengerCopy.summedToday[lang]);
      await expect(total).toContainText("58,364");
      const formula = page.locator('[data-testid="airport-sum-formula"]');
      await expect(formula).toContainText(passengerCopy.hallComponent[lang]);
      await expect(formula).toContainText("47,320");
      await expect(formula).toContainText(passengerCopy.transferComponent[lang]);
      await expect(formula).toContainText("11,044");
      await expect(page.locator(".passenger-transfer-limitation").first()).toContainText(passengerCopy.arithmeticNote[lang]);

      // The arithmetic must be CHECKABLE BY EYE, which is the only reason to
      // show it as arithmetic at all. The first attempt laid the terms across a
      // row and at 390px the "=" wrapped onto a line of its own, under the
      // second figure — a stray glyph rather than an operator. So lock the
      // three things that make it read as addition:
      //   · every operator shares a row with the term it applies to,
      //   · "+" and "=" sit in one column, directly under one another,
      //   · the figures share a right edge, so their digit places line up.
      const ledger = await formula.locator(".airport-sum-row").evaluateAll(rows => rows.map(row => {
        const box = row.getBoundingClientRect();
        const op = row.querySelector(".airport-sum-op")!.getBoundingClientRect();
        const value = row.querySelector(".airport-sum-value")!.getBoundingClientRect();
        return {
          kind: (row as HTMLElement).dataset.kind,
          opText: (row.querySelector(".airport-sum-op")?.textContent ?? "").trim(),
          opLeft: op.left - box.left, opMid: op.top + op.height / 2,
          rowTop: box.top, rowBottom: box.bottom,
          valueRight: box.right - value.right,
        };
      }));
      expect(ledger.map(r => `${r.kind}:${r.opText}`)).toEqual(["hall:", "transfer:+", "total:="]);
      for (const row of ledger) {
        expect(row.opMid > row.rowTop && row.opMid < row.rowBottom,
          `the ${row.kind} operator must sit on its own term's row, not float between rows`).toBe(true);
      }
      const opLefts = ledger.map(r => Math.round(r.opLeft));
      expect(Math.max(...opLefts) - Math.min(...opLefts),
        "+ and = must share one column").toBeLessThanOrEqual(1);
      const valueRights = ledger.map(r => Math.round(r.valueRight));
      expect(Math.max(...valueRights) - Math.min(...valueRights),
        "the figures must share a right edge so the places line up").toBeLessThanOrEqual(1);

      // The hall figure must never be a larger, higher headline than the sum.
      const hallOnly = page.getByText(passengerCopy.today[lang], { exact: false });
      expect(await hallOnly.count(), "the hall-only headline must not return above the sum").toBe(0);

      // Vertical order, from real geometry.
      const tops: number[] = [];
      for (const selector of ORDER) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box, `${selector} must be rendered`).not.toBeNull();
        tops.push(box!.y);
      }
      for (let i = 1; i < tops.length; i += 1) {
        expect(tops[i], `${ORDER[i]} must sit below ${ORDER[i - 1]}`).toBeGreaterThan(tops[i - 1]);
      }

      // DOM order too, so a purely visual reshuffle cannot pass while the
      // reading order a screen reader follows is wrong.
      const domOrder = await page.evaluate((selectors) => selectors.map((selector) => {
        const el = document.querySelector(selector);
        if (!el) return -1;
        let index = 0;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) { index += 1; if (walker.currentNode === el) return index; }
        return -1;
      }), ORDER as unknown as string[]);
      expect(domOrder.every((value) => value > 0)).toBe(true);
      expect([...domOrder].sort((a, b) => a - b)).toEqual(domOrder);

      // 6-8: month to date, its comparison, and the daily chart.
      const mtd = page.locator('[data-testid="airport-mtd"]');
      await expect(mtd).toContainText(mtdCopy.heading[lang]);
      await expect(mtd).toContainText("46,800");           // 13 x 3,600
      await expect(mtd).toContainText(mtdCopy.previous[lang]);
      await expect(mtd).toContainText("42,120");           // 13 x 3,240
      await expect(mtd).toContainText("+11.1%");
      await expect(mtd).toContainText("9/1–9/13");
      await expect(mtd).toContainText("8/1–8/13");

      // The running total is a second series on the same plot, so it must be
      // named and it must end somewhere a reader can point at. An unlabelled
      // blue diagonal measures nothing as far as the reader can tell.
      const legend = page.locator(".airport-month-legend");
      await expect(legend).toContainText(mtdCopy.perDay[lang]);
      await expect(legend).toContainText(mtdCopy.cumulative[lang]);
      const plot = await page.locator(".airport-month-plot").boundingBox();
      const endDot = await page.locator(".airport-month-run-end").boundingBox();
      expect(endDot, "the running total must end in a marked point").not.toBeNull();
      expect(endDot!.x).toBeGreaterThanOrEqual(plot!.x - 4);
      expect(endDot!.x + endDot!.width).toBeLessThanOrEqual(plot!.x + plot!.width + 4);
      expect(endDot!.y).toBeGreaterThanOrEqual(plot!.y - 4);

      // Bars are inset by half their width, so the 1st and today — the two days
      // a reader looks at most — are drawn whole instead of half-clipped by the
      // plot edge.
      const bars = await page.locator(".airport-month-bar").evaluateAll(els =>
        els.map(el => [Number(el.getAttribute("x")), Number(el.getAttribute("width"))] as const));
      expect(bars.length).toBeGreaterThan(1);
      for (const [x, w] of bars) {
        expect(x, "no bar may start left of the plot").toBeGreaterThanOrEqual(-0.01);
        expect(x + w, "no bar may run past the plot's right edge").toBeLessThanOrEqual(100.01);
      }

      // Nothing may overflow its box, and the page may not scroll sideways.
      const clipped = await page.locator('.airport-sum-formula *, .airport-mtd *').evaluateAll(els => els
        .map(el => ({ text: (el.textContent ?? "").trim().slice(0, 40), over: el.scrollWidth - el.clientWidth }))
        .filter(x => x.over > 1));
      expect(clipped, "no clipped figure in the sum or month block").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test("month to date reads the selected terminal's own month, never a neighbour's", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.route("**/api/live/summary**", routeSummary(WITH_TRANSFER));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  const mtd = page.locator('[data-testid="airport-mtd"]');
  await expect(mtd).toHaveAttribute("data-scope", "all");
  await expect(mtd).toContainText("46,800");

  // Fixture months: all 3,600/day, T1 2,400/day, T2 1,200/day over 13 days.
  for (const [terminal, own, foreign] of [["T1", "31,200", ["46,800", "15,600"]], ["T2", "15,600", ["46,800", "31,200"]]] as const) {
    await page.getByRole("tab", { name: terminal, exact: true }).click();
    await expect(mtd).toHaveAttribute("data-scope", terminal);
    await expect(mtd).toContainText(own);
    for (const other of foreign) await expect(mtd).not.toContainText(other);
  }
});

/**
 * A month with a hole in it. The owner's rule: a missing day must never be
 * counted as zero, and a partial span must never wear a complete label. This
 * also exercises the longest strings the block can render — the withheld-growth
 * sentence — which the complete fixture never reaches.
 */
const GAPPED = (() => {
  const clone = JSON.parse(JSON.stringify(WITH_TRANSFER));
  for (const key of ["all", "T1", "T2"]) {
    const month = clone.airport.monthToDate[key];
    month.current.days = month.current.days.map((day: { date: string }) =>
      day.date === "2026-09-06" ? { ...day, total: null } : day);
    month.current.total = null;
    month.current.status = "PARTIAL";
    month.current.completeDays = 12;
    month.current.missingDates = ["2026-09-06"];
    month.change = null;
  }
  return clone;
})();

for (const lang of ["ko", "en", "zh", "ja"] as const) {
  for (const width of [390, 1280]) {
    test(`a month with a missing day reads as incomplete, not small · ${lang} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route("**/api/live/summary**", routeSummary(GAPPED));
      await page.goto(`/${lang}/airport`);
      await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
      const mtd = page.locator('[data-testid="airport-mtd"]');

      // No total, and no figure that could be mistaken for one.
      await expect(mtd).toContainText(mtdCopy.partial[lang](12, 13));
      await expect(mtd).not.toContainText("46,800");
      await expect(mtd).toContainText(mtdCopy.missing[lang](["9/6"]));
      // The previous span is whole, but growth still needs BOTH.
      await expect(mtd).toContainText("42,120");
      await expect(mtd).toContainText(mtdCopy.bothComplete[lang]);
      await expect(mtd.locator(".airport-glance-change")).toHaveCount(0);

      // The running line must stop at the gap rather than step over it.
      const points = await page.locator(".airport-month-run").getAttribute("points");
      expect((points ?? "").trim().split(/\s+/).length,
        "the running total is drawn only for the complete days before the gap").toBe(5);

      expect(await page.locator('.airport-mtd *').evaluateAll(els => els
        .map(el => ({ text: (el.textContent ?? "").trim().slice(0, 40), over: el.scrollWidth - el.clientWidth }))
        .filter(x => x.over > 1)), "no clipped text in the partial month block").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
