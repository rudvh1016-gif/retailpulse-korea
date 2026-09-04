import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

/**
 * Every test file must actually be run by CI.
 *
 * `test:unit` used to be a hand-maintained list of filenames. On 2026-09-04
 * an inventory audit found `tests/weather-guide.test.mjs` — nine real
 * assertions about the deterministic weather guide — in the repository, in
 * neither that list nor any other CI step. It had never run in CI. Nothing
 * failed, which is the point: a test that is not run cannot fail, so the
 * gap is invisible until someone counts.
 *
 * The list is now derived from the directory, and this test is the thing
 * that keeps it honest: add a test file and it runs, or this fails.
 *
 * The one deliberate exception is `rendered-html.test.mjs`, which imports
 * `dist/server/index.js` and therefore has to run after the build as its
 * own CI step.
 */
const BUILD_DEPENDENT = "tests/rendered-html.test.mjs";

test("every test file in tests/ is reachable by a CI step", async () => {
  const [pkgRaw, ciRaw, entries] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readdir(new URL("../tests/", import.meta.url)),
  ]);
  const pkg = JSON.parse(pkgRaw);
  const files = entries.filter((name) => /\.test\.(mjs|ts)$/.test(name)).map((name) => `tests/${name}`);
  assert.ok(files.length > 0);

  // CI runs the derived unit list, then the build-dependent file separately.
  assert.match(pkg.scripts["test:unit"], /ls tests\/\*\.test\.mjs tests\/\*\.test\.ts/,
    "the unit list must be derived from the directory, not hand-maintained");
  assert.match(ciRaw, /npm run test:unit/);
  assert.match(ciRaw, new RegExp(`node --test ${BUILD_DEPENDENT.replace(/[./]/g, "\\$&")}`),
    "the build-dependent suite must keep its own post-build step");

  // The derived list excludes exactly one file, and CI runs that one itself.
  const excluded = files.filter((file) => pkg.scripts["test:unit"].includes(`grep -v '${file}'`));
  assert.deepEqual(excluded, [BUILD_DEPENDENT],
    "only the build-dependent suite may be excluded from the derived list");
});

test("npm test runs the same set CI does, so a local pass means what it says", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  // `npm test` used to glob only *.test.mjs, silently skipping every *.test.ts
  // suite — which is why local and CI counts disagreed in past reports.
  assert.match(pkg.scripts.test, /npm run test:unit/);
  assert.match(pkg.scripts.test, /tests\/rendered-html\.test\.mjs/);
  assert.doesNotMatch(pkg.scripts.test, /--test tests\/\*\.test\.mjs/,
    "a partial glob makes a local run look complete when it is not");
});
