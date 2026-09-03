import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { CloudflareD1RestDatabase } from "../lib/d1-rest.ts";

/**
 * The REST adapter is what GitHub Actions actually talks to, while unit tests
 * run against the Workers binding or a SQLite double. A method that exists on
 * those but not here throws only in Production — and both times it happened,
 * the throw was swallowed by a `catch` and turned into a wrong answer rather
 * than a visible failure. So this scans the real call sites instead of listing
 * methods by hand.
 */
/**
 * Finds the method called on the result of `.prepare(...)`, optionally through
 * `.bind(...)`. A regex cannot do this: the argument lists contain parentheses
 * and multi-line SQL, so the scan walks to the matching close paren instead of
 * guessing where the call ends.
 */
function preparedStatementMethods(source) {
  const found = new Set();
  const skipCall = (from) => {
    let depth = 0;
    for (let index = from; index < source.length; index += 1) {
      const character = source[index];
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    return -1;
  };
  for (let index = source.indexOf(".prepare("); index !== -1; index = source.indexOf(".prepare(", index + 1)) {
    let cursor = skipCall(index + ".prepare".length);
    if (cursor < 0) continue;
    for (let hop = 0; hop < 2; hop += 1) {
      const rest = source.slice(cursor);
      const next = /^\s*\.(\w+)\s*[(<]/.exec(rest);
      if (!next) break;
      found.add(next[1]);
      // `.bind(...)` returns the statement, so keep walking to the real read.
      if (next[1] !== "bind") break;
      const openParen = cursor + rest.indexOf("(", next[0].length - 1);
      cursor = skipCall(openParen);
      if (cursor < 0) break;
    }
  }
  return found;
}

test("the REST adapter implements every prepared-statement method the code calls", async () => {
  const statement = new CloudflareD1RestDatabase("acct", "db", "token").prepare("SELECT 1");
  for (const method of ["bind", "run", "all", "first", "query"]) {
    assert.equal(typeof statement[method], "function", `RestPreparedStatement must implement ${method}()`);
  }
  const database = new CloudflareD1RestDatabase("acct", "db", "token");
  for (const method of ["prepare", "batch", "execute"]) {
    assert.equal(typeof database[method], "function", `CloudflareD1RestDatabase must implement ${method}()`);
  }

  // Now the same check driven by what the code actually calls, so a new call
  // site is covered without anyone remembering to extend the list above.
  const root = new URL("../", import.meta.url);
  const called = new Set();
  for (const directory of ["lib", "scripts", "app"]) {
    const base = new URL(`${directory}/`, root);
    for (const entry of await readdir(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(ts|tsx|mjs)$/.test(entry.name)) continue;
      const source = await readFile(join(entry.parentPath, entry.name), "utf8");
      // A local `node:sqlite` script prepares statements against a different
      // driver (its own `.get()`), so its call sites say nothing about what
      // this adapter owes Production.
      if (source.includes("node:sqlite")) continue;
      for (const method of preparedStatementMethods(source)) called.add(method);
    }
  }
  assert.ok(called.size > 0, "the scan must actually find prepared-statement calls");
  for (const method of called) {
    assert.equal(typeof statement[method], "function",
      `code calls .${method}() on a prepared statement, so the REST adapter must implement it`);
  }
});

test("first() returns the first row, or null when there is none", async () => {
  const responses = [
    { success: true, result: [{ success: true, results: [{ n: 1221 }] }] },
    { success: true, result: [{ success: true, results: [] }] },
  ];
  let call = 0;
  const database = new CloudflareD1RestDatabase("acct", "db", "token", async () => ({
    ok: true, status: 200, json: async () => responses[call++],
  }));

  const row = await database.prepare("SELECT COUNT(*) AS n FROM airport_facility").first();
  assert.deepEqual(row, { n: 1221 });
  // An empty read is null, not a throw: A2's last-good check reads this to
  // decide STALE versus ERROR, and a throw there becomes a wrong status.
  assert.equal(await database.prepare("SELECT 1").first(), null);
});
