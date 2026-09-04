import type { Locator } from "@playwright/test";

/**
 * Find visible characters that Chromium rendered as the font's missing-glyph
 * box. `document.fonts.check()` only proves that a face loaded, and platform-
 * font inspection counts `.notdef` as if the requested face drew a glyph.
 * Comparing the real canvas raster with three unassigned Unicode sentinels
 * catches the failure a reader actually sees without parsing WOFF2 in tests.
 */
export const tofuCharacters = (locator: Locator) => locator.evaluate(async (root) => {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 180;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2d canvas unavailable");

  const raster = (character: string, font: string) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = font;
    context.textBaseline = "alphabetic";
    context.fillStyle = "#000";
    context.fillText(character, 20, 125);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    // Two cheap independent accumulators avoid returning a 130 KB ImageData
    // value for every character while keeping collision risk negligible.
    let hash = 2166136261;
    let weighted = 0;
    let ink = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      const alpha = pixels[index];
      hash = Math.imul(hash ^ alpha, 16777619);
      if (alpha) {
        ink += 1;
        weighted = (weighted + Math.imul(index + 1, alpha)) >>> 0;
      }
    }
    return `${context.measureText(character).width.toFixed(3)}:${hash >>> 0}:${weighted}:${ink}`;
  };

  const sentinels = ["\u0378", "\u0380", "\u{10FFFF}"];
  const references = new Map<string, Set<string>>();
  const checked = new Set<string>();
  const missing: Array<{ character: string; font: string; weight: string }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const element = node.parentElement;
    if (!element || !node.data.trim() || element.getClientRects().length === 0) continue;

    const style = getComputedStyle(element);
    const font = `${style.fontStyle} ${style.fontWeight} 100px ${style.fontFamily}`;
    let notdefs = references.get(font);
    if (!notdefs) {
      notdefs = new Set(sentinels.map((sentinel) => raster(sentinel, font)));
      references.set(font, notdefs);
    }

    for (const character of new Set(node.data)) {
      if (/\s/u.test(character)) continue;
      const key = `${font}\0${character}`;
      if (checked.has(key)) continue;
      checked.add(key);
      if (notdefs.has(raster(character, font))) {
        missing.push({ character, font: style.fontFamily, weight: style.fontWeight });
      }
    }
  }

  return missing;
});
