import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { REVEAL_MS, STATE_MS, countUp, reducedMotion } from "../lib/motion.ts";

const css = readFileSync(new URL("../app/airport-visual.css", import.meta.url), "utf8");

test("the airport visual tokens exist, and the page ground is not one of them", () => {
  for (const token of ["--sky-100", "--sky-300", "--sky-500", "--dusk", "--dusk-deep", "--cloud-200", "--cloud-400", "--cloud-600", "--haze", "--slate", "--motion-reveal", "--motion-state"]) {
    assert.match(css, new RegExp(`${token}:`), token);
  }
  // Pastel is for figures. The page itself keeps globals.css's paper white.
  assert.doesNotMatch(css, /\bbody\s*\{|\bhtml\s*\{|--paper:/);
  // No gradients or shadows anywhere in the visual layer.
  assert.doesNotMatch(css, /gradient\(|box-shadow/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("GSAP is never imported statically by page code (it loads only when a figure animates)", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const text = readFileSync(path, "utf8");
      if (/^\s*import\s+[^;]*from\s+["']gsap(\/[^"']*)?["']/m.test(text)) offenders.push(path);
    }
  };
  walk(new URL("../app", import.meta.url).pathname);
  walk(new URL("../lib", import.meta.url).pathname);
  assert.deepEqual(offenders, []);
  assert.match(readFileSync(new URL("../lib/motion.ts", import.meta.url), "utf8"), /import\("gsap"\)/);
});

test("without a window, motion is off and a count-up renders the final value at once", () => {
  assert.equal(reducedMotion(), true);
  const seen = [];
  const stop = countUp(1234, (value) => seen.push(value));
  assert.deepEqual(seen, [1234]);
  stop();
  assert.equal(seen.at(-1), 1234);
  assert.ok(REVEAL_MS > STATE_MS && REVEAL_MS <= 800, "one reveal speed, under a second");
});
