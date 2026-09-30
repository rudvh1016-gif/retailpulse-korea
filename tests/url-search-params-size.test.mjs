import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// URLSearchParams.size shipped in Chrome/Edge 113, Firefox 112 and Safari 17.
// On an older engine `params.size` is undefined, so a dated or monthly link
// silently lost its query and showed today's data under the chosen date.
test("no client code decides on URLSearchParams.size", async () => {
  for (const file of ["../app/live-signals.tsx", "../app/retailpulse-app.tsx"]) {
    const source = (await readFile(new URL(file, import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(source, /\b(?:query|params|searchParams)\.size\b/, file);
  }
});

test("toString() keeps the query on an engine without .size", () => {
  const params = new URLSearchParams();
  params.set("date", "2026-10-01");
  Object.defineProperty(params, "size", { value: undefined });
  const text = params.toString();
  assert.equal(`/api/live/summary${text ? `?${text}` : ""}`, "/api/live/summary?date=2026-10-01");
  assert.equal(`/api/live/summary${new URLSearchParams().toString() ? "?x" : ""}`, "/api/live/summary");
});
