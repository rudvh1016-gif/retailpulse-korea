/**
 * What the redesigned screens actually SAY on the live site, in every locale.
 *
 * The pure-white and composition suites already prove the live pages render.
 * They do not read the two blocks the 2026-09-13 screen work introduced: the
 * airport at-a-glance grid and the Seoul chart's selection readout. A layout
 * that passes every assertion can still clip a Japanese label or push the page
 * sideways at 390px, and in practice only Korean gets looked at by hand.
 *
 * So: visit all four locales at phone and desktop width, print what each block
 * renders, and fail on what live data can honestly decide — a box whose content
 * overflows it, a page that scrolls sideways, an empty cell, a readout that has
 * slipped below its plot. The printed text goes to the job log, which is
 * readable without downloading the screenshot artifact.
 *
 * What this deliberately does NOT do is re-derive a layout opinion from live
 * numbers. Production values move every hour; an assertion built on them fails
 * a correct screen sooner or later. Structure, emptiness and geometry are
 * stable; the figures are not.
 *
 * Read-only: page views only. No clicks, no storage writes, no form posts —
 * nothing that could change a preference or a stored row.
 */
import { test, expect } from "@playwright/test";

const widths = [
  { name: "mobile", width: 390, height: 900 },
  { name: "desktop", width: 1280, height: 1000 },
] as const;

/**
 * A box clips its own text when the content is wider than the box.
 *
 * Inline and display:none elements report 0 for both, so they cancel to 0 and
 * drop out rather than reading as a false overflow; the 1px slack absorbs
 * sub-pixel rounding. Text that WRAPS is not clipping and is not reported,
 * which is correct — the page-level check below is what catches text forcing
 * the layout wider than the screen.
 */
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
        band: (el.querySelector("dd small")?.textContent ?? "").trim(),
      })));
      console.log(`GLANCE ${locale} ${viewport.name} ${JSON.stringify(cells)}`);
      expect(cells.length, "the grid must carry its three questions").toBe(3);
      for (const cell of cells) {
        expect(cell.label.length, "every cell names what it is").toBeGreaterThan(0);
        // Never an empty value. A cell with no data says so in words
        // ("확인 불가" / "비교 자료 없음"), which satisfies this and must:
        // a silent blank is the failure mode, not missing data itself.
        expect(cell.value.length, `${cell.label} must answer or say it cannot`).toBeGreaterThan(0);
      }

      const support = await page.locator(".airport-current-brief .airport-near-term")
        .evaluateAll(els => els.map(el => (el.textContent ?? "").trim()));
      console.log(`SUPPORT ${locale} ${viewport.name} ${JSON.stringify(support)}`);
      // The removed line restated the grid's first cell. Guard its return by the
      // current hour's BAND, never by its count: two bands legitimately carry the
      // same number — the next hour IS the peak through most of a morning ramp —
      // so comparing figures would fail a correct screen at a predictable time of
      // day. The band is unique to this cell: the supporting line's "next" band is
      // by construction the following one, and the rest-of-day line carries a bare
      // clock time, not a band. Skipped when there is no current hour to restate.
      const nowBand = (cells[0]?.band ?? "").replace(/\s*KST\s*$/, "");
      if (nowBand) {
        for (const line of support) {
          expect(line.includes(nowBand),
            `a supporting line restates the grid's current-hour band ${nowBand}`).toBe(false);
        }
      }

      // The executive brief's own order, read from the live page (2026-09-14).
      // The sum leads, is shown as arithmetic, and carries its limitation; the
      // month block follows the hourly chart and the glance grid. Geometry, not
      // markup order, because that is what a reader actually experiences.
      const sum = page.locator('[data-testid="airport-sum-total"]');
      const formula = page.locator('[data-testid="airport-sum-formula"]');
      const mtd = page.locator('[data-testid="airport-mtd"]');
      if (await sum.count()) {
        console.log(`SUM ${locale} ${viewport.name} ${JSON.stringify((await sum.innerText()).replace(/\s+/g, " ").trim())}`);
        console.log(`FORMULA ${locale} ${viewport.name} ${JSON.stringify((await formula.innerText()).replace(/\s+/g, " ").trim())}`);
        const order: number[] = [];
        for (const locator of [sum, formula, page.locator(".passenger-transfer-limitation").first(), strip]) {
          const box = await locator.boundingBox();
          expect(box, "every leading block must render").not.toBeNull();
          order.push(box!.y);
        }
        for (let i = 1; i < order.length; i += 1) {
          expect(order[i], "the sum leads, then the formula, then its limitation").toBeGreaterThan(order[i - 1]);
        }
        // The hall figure is an OPERAND. It must never be a headline above the sum.
        //
        // Counted before it is measured: `boundingBox()` WAITS for a matching
        // element rather than returning null, so asking it about a locator that
        // correctly matches nothing hangs until the test times out. When the sum
        // is formed there is deliberately no bare hall headline, which is the
        // common case — so the absence has to be checked, not awaited.
        const sumTop = order[0];
        const hallHeadline = page.locator(".airport-brief-total:not([data-basis])");
        if (await hallHeadline.count()) {
          const box = await hallHeadline.boundingBox();
          if (box) expect(box.y, "the hall-only headline must not sit above the sum").toBeGreaterThan(sumTop);
        }

        // The sum is shown as arithmetic so a reader can check it by eye, and
        // that only works if the expression is laid out as one: each operator
        // on its own term's row, "+" and "=" in one column, the figures sharing
        // a right edge. Structure and geometry only — never the live figures.
        const ledger = await formula.locator(".airport-sum-row").evaluateAll(rows => rows.map(row => {
          const box = row.getBoundingClientRect();
          const op = row.querySelector(".airport-sum-op")!.getBoundingClientRect();
          const value = row.querySelector(".airport-sum-value")!.getBoundingClientRect();
          return {
            kind: (row as HTMLElement).dataset.kind,
            opText: (row.querySelector(".airport-sum-op")?.textContent ?? "").trim(),
            opLeft: Math.round(op.left - box.left), opMid: op.top + op.height / 2,
            rowTop: box.top, rowBottom: box.bottom,
            valueRight: Math.round(box.right - value.right),
          };
        }));
        console.log(`LEDGER ${locale} ${viewport.name} ${JSON.stringify(ledger.map(r => `${r.kind}:${r.opText}`))}`);
        expect(ledger.map(r => `${r.kind}:${r.opText}`)).toEqual(["hall:", "transfer:+", "total:="]);
        for (const row of ledger) {
          expect(row.opMid > row.rowTop && row.opMid < row.rowBottom,
            `the ${row.kind} operator must sit on its own term's row`).toBe(true);
        }
        expect(Math.max(...ledger.map(r => r.opLeft)) - Math.min(...ledger.map(r => r.opLeft)),
          "+ and = must share one column").toBeLessThanOrEqual(1);
        expect(Math.max(...ledger.map(r => r.valueRight)) - Math.min(...ledger.map(r => r.valueRight)),
          "the figures must share a right edge").toBeLessThanOrEqual(1);
      } else {
        console.log(`SUM ${locale} ${viewport.name} "not formed — transfer forecast unavailable"`);
      }
      if (await mtd.count()) {
        console.log(`MTD ${locale} ${viewport.name} ${JSON.stringify((await mtd.innerText()).replace(/\s+/g, " ").trim().slice(0, 260))}`);
        await expect(mtd).toHaveAttribute("data-scope", "all");

        // A second series on the plot has to be named and has to end somewhere
        // the reader can point at; an unlabelled blue diagonal measures nothing
        // as far as they can tell. Its text is read from the page rather than
        // asserted, because the labels are the same in every locale's own words
        // and the point here is that BOTH marks are named at all.
        const legend = await page.locator(".airport-month-legend").innerText();
        console.log(`LEGEND ${locale} ${viewport.name} ${JSON.stringify(legend.replace(/\s+/g, " ").trim())}`);
        expect(legend.trim().length, "both marks on the month plot must be named").toBeGreaterThan(0);
        expect(await page.locator(".airport-month-legend span i").count(),
          "one swatch for the bars and one for the running total").toBe(2);
        const plot = await page.locator(".airport-month-plot").boundingBox();
        const endDot = await page.locator(".airport-month-run-end").boundingBox();
        expect(endDot, "the running total must end in a marked point").not.toBeNull();
        expect(endDot!.x + endDot!.width).toBeLessThanOrEqual(plot!.x + plot!.width + 4);
        expect(endDot!.y).toBeGreaterThanOrEqual(plot!.y - 4);

        // Bars inset by half their width, so the 1st and today are drawn whole.
        const bars = await page.locator(".airport-month-bar").evaluateAll(els =>
          els.map(el => [Number(el.getAttribute("x")), Number(el.getAttribute("width"))] as const));
        for (const [x, w] of bars) {
          expect(x).toBeGreaterThanOrEqual(-0.01);
          expect(x + w).toBeLessThanOrEqual(100.01);
        }

        expect(await overflowing(page, ".airport-mtd *"), "no clipped text in the month block").toEqual([]);
      } else {
        console.log(`MTD ${locale} ${viewport.name} "absent"`);
      }
      expect(await overflowing(page, ".airport-glance-strip *"), "no clipped cell").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`airport-${locale}-${viewport.name}.png`) });

      // Seoul: the chart readout, which now sits above the plot it describes.
      await page.goto(`/${locale}/hongdae`);
      await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
      await expect(page.locator(".population-chart")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const readout = page.locator(".flow-readout").first();
      await expect(readout).toBeVisible();
      console.log(`READOUT ${locale} ${viewport.name} ${JSON.stringify((await readout.textContent() ?? "").trim())}`);
      const [readoutBox, chartBox] = [await readout.boundingBox(), await page.locator(".population-chart").boundingBox()];
      expect(readoutBox!.y + readoutBox!.height,
        "the readout must sit above the plot; that is the whole point of moving it")
        .toBeLessThanOrEqual(chartBox!.y + 1);
      expect(await overflowing(page, ".flow-readout, .flow-head, .flow-notes"), "no clipped chart text").toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`seoul-${locale}-${viewport.name}.png`) });
    });
  }
}
