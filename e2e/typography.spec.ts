import { expect, test } from "@playwright/test";

import { routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";

/**
 * TYPOGRAPHY regression, from the owner's 2026-09-04 review of the install
 * guide: "글씨폰트 글자체 왤케 깨진거마냥 뒤죽박죽이야 통일성줘".
 *
 * Two separate things make text look like a broken mixture of typefaces,
 * and both are invisible to every other test here — the page still renders,
 * still passes its content assertions, and is still pure white:
 *
 *   1. Too many sizes and weights in one panel. Four sizes (22/13/12/11)
 *      across four line heights read as an accident, not a hierarchy.
 *   2. A character the bundled font subset does not carry. The browser
 *      silently draws that ONE character from a fallback font, so a single
 *      symbol comes out at a different width and weight from its
 *      neighbours. The first version of the guide used ≡ and ⬆ for the
 *      Samsung and iOS buttons and an arrow between menu steps; none of the
 *      three is in any bundled subset.
 *
 * The fonts are self-hosted subsets built from the production copy, so (2)
 * is a live risk every time copy is added. These tests measure the real
 * rendered result rather than reading the stylesheet.
 *
 * Coverage is asserted on Korean only, and deliberately so. Pretendard's
 * subset is built from the Korean and English copy, so "every character is
 * drawn by the bundled font" is a promise this repository can keep there.
 * The Noto SC / JP subsets are narrower — they carry neither `·` nor plain
 * ASCII punctuation — so ZH and JA fall back on characters that appear all
 * over the existing product, not only here. That is a real but separate,
 * pre-existing issue with those two subsets, and failing this test on it
 * would claim the install guide broke something it did not. What holds for
 * all four locales instead is the symbol allowlist in
 * `tests/install-guide.test.mjs`: new copy may only use symbols the product
 * already uses.
 */

/**
 * A character is covered when it measures identically against two fallback
 * families with different metrics: if the primary font has the glyph, the
 * fallback is never reached and the two widths match.
 */
const uncoveredCharacters = (page: import("@playwright/test").Page, sample: string) =>
  page.evaluate((text) => {
    const primary = getComputedStyle(document.body).fontFamily.split(",")[0];
    const measure = (ch: string, fallback: string) => {
      const span = document.createElement("span");
      span.textContent = ch;
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-size:100px;font-family:${primary},${fallback}`;
      document.body.appendChild(span);
      const width = span.getBoundingClientRect().width;
      span.remove();
      return width;
    };
    const missing: string[] = [];
    for (const ch of new Set(text)) {
      // ASCII and whitespace are drawn the same by every fallback here.
      if (ch.codePointAt(0)! < 0x00a0) continue;
      if (Math.abs(measure(ch, "serif") - measure(ch, "monospace")) > 0.5) missing.push(ch);
    }
    return missing;
  }, sample);

const openGuide = async (page: import("@playwright/test").Page, locale: string) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto(`/${locale}`);
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.waitForFunction(() => document.fonts.ready.then(() => true));
  await page.locator(".topbar .install-app-button").click();
  const dialog = page.locator(".install-modal");
  await expect(dialog).toBeVisible();
  return dialog;
};

test("every character of the install guide is drawn by the bundled font", async ({ page }) => {
  const dialog = await openGuide(page, "ko");
  const text = (await dialog.innerText()).replace(/\s+/g, " ");
  const missing = await uncoveredCharacters(page, text);
  expect(missing, `these characters fall back to another font and look wrong: ${missing.join(" ")}`).toEqual([]);
});

/**
 * One scale, deliberately narrow. Sizes and weights are read off the real
 * computed styles, so a stray `font-size: 11px` added later fails here even
 * when the copy and the layout are fine.
 */
test("the install guide uses one type scale and two weights", async ({ page }) => {
  await openGuide(page, "ko");

  const used = await page.evaluate(() => {
    const sizes = new Set<string>();
    const weights = new Set<string>();
    const heights = new Set<string>();
    for (const node of Array.from(document.querySelectorAll(".install-modal *"))) {
      // Only elements that draw text of their own.
      const ownText = Array.from(node.childNodes).some((child) => child.nodeType === 3 && child.textContent?.trim());
      if (!ownText) continue;
      const style = getComputedStyle(node);
      sizes.add(style.fontSize);
      weights.add(style.fontWeight);
      // The ratio, not the pixel value: a 13px and a 20px line share a
      // rhythm when they share a ratio, and differ in px by definition.
      if (node.tagName !== "BUTTON") heights.add((parseFloat(style.lineHeight) / parseFloat(style.fontSize)).toFixed(2));
    }
    return { sizes: [...sizes].sort(), weights: [...weights].sort(), heights: [...heights].sort() };
  });

  // 20px title · 13px anything the reader must read · 12px the note beneath
  // it, plus the 10px eyebrow every panel in the product already uses.
  expect(used.sizes).toEqual(["10px", "12px", "13px", "20px"]);
  // A non-standard weight is synthesised when the variable font has not
  // loaded, and that alone makes a block look like a different typeface.
  expect(used.weights).toEqual(["400", "600"]);
  // Prose shares one rhythm; the title is the only exception.
  expect(used.heights, `line-height ratios in use: ${used.heights.join(", ")}`).toEqual(["1.30", "1.70"]);
});
