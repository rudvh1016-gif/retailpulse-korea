/**
 * Does the bundled font actually carry the letters this product prints?
 *
 * `public/fonts/koretail-sans-variable.woff2` is a 226 KB subset generated
 * from the product's own copy (see docs/licenses/FONT-ASSET-SOURCES.md). That
 * makes it small, and it makes it fragile in one specific way: add a Korean
 * word using a syllable nobody has written before, and the subset silently
 * stops covering the copy. The page still renders, every content assertion
 * still passes, and every screenshot still looks almost right.
 *
 * What it costs is not cosmetic. Measured on 2026-09-22: eight syllables
 * introduced with the server-rendered brief (깔뀔끔났넣묻쓴힌 — one of them in
 * "자주 묻는 질문", which appears on every Korean page) took `/ko` and
 * `/ko/myeongdong` from loading the 226 KB subset alone to also loading
 * `pretendard-variable.woff2`, all 2,057,688 bytes of it. That is roughly ten
 * times the page's entire font budget, downloaded to draw eight characters.
 *
 * e2e/typography.spec.ts already looks for tofu — characters drawn as the
 * missing-glyph box. It cannot catch this: the fallback face draws the
 * syllable perfectly, just in the wrong typeface and after a 2 MB download.
 * This test reads the coverage directly instead, and names the exact
 * characters, so the fix is obvious rather than archaeological.
 *
 * When it fails there are two honest ways out: reword the copy to stay inside
 * the subset, or regenerate the subset and this fixture together. Do not
 * delete the syllable from the fixture by hand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const fixture = JSON.parse(await readFile(new URL("./fixtures/koretail-sans-hangul.json", import.meta.url), "utf8"));
const carried = new Set(fixture.syllables);

/** The same corpus the subset was generated from: text-bearing source under app/ and lib/. */
async function productCopy() {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(ts|tsx|css|mjs|json)$/.test(entry.name)) files.push(path);
    }
  };
  await walk(new URL("../app/", import.meta.url));
  await walk(new URL("../lib/", import.meta.url));
  return files;
}

test("every Korean syllable the product prints is in the bundled subset", async () => {
  const uncovered = new Map();
  for (const file of await productCopy()) {
    for (const character of await readFile(file, "utf8")) {
      const code = character.codePointAt(0);
      if (code < 0xac00 || code > 0xd7a3) continue;
      if (carried.has(character)) continue;
      if (!uncovered.has(character)) uncovered.set(character, file.pathname.replace(/.*\/retailpulse-korea\//, ""));
    }
  }

  assert.deepEqual([...uncovered.keys()], [],
    `these syllables are not in koretail-sans-variable.woff2, so a Korean reader downloads the 2 MB fallback face to draw them: ${
      [...uncovered].map(([character, file]) => `${character} (${file})`).join(", ")
    }. Reword the copy, or regenerate the subset AND tests/fixtures/koretail-sans-hangul.json together.`);
});

/**
 * The fixture is a snapshot of the font, so it is only true while it matches
 * the font. If the subset is ever regenerated without regenerating this, the
 * test above would be checking copy against a stale coverage list — passing
 * while the real font had changed underneath it.
 */
test("the coverage fixture still describes the font that ships", async () => {
  const bytes = await readFile(new URL("../public/fonts/koretail-sans-variable.woff2", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture._font_sha256,
    "koretail-sans-variable.woff2 changed; regenerate tests/fixtures/koretail-sans-hangul.json with the command in its _regenerate field");
  assert.ok(carried.size > 800, `the fixture carries only ${carried.size} syllables, which cannot be the real subset`);
});
