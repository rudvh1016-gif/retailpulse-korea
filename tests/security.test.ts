import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("production-facing source contains no chatgpt.site canonical", async () => {
  const files = ["app/layout.tsx", "app/seo-config.ts", "app/sitemap.ts", "app/robots.ts", "next.config.ts", "wrangler.production.jsonc"];
  for (const file of files) {
    const body = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(body, /retailpulse-seoul\.rudvh1016\.chatgpt\.site/);
  }
});

test("technical handoff documents are not public assets", async () => {
  const files = await readdir(new URL("../public", import.meta.url));
  assert.equal(files.some((file) => file.endsWith(".md")), false);
});

test("beta signup is disabled by default and guarded when enabled", async () => {
  const route = await readFile(new URL("../app/api/beta-signups/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  assert.match(route, /ENABLE_BETA_SIGNUPS !== "true"/);
  assert.match(route, /payload_too_large/);
  assert.match(route, /invalid_origin/);
  assert.match(page, /NEXT_PUBLIC_ENABLE_BETA_SIGNUP === "true"/);
});

test("production headers include clickjacking, sniffing and privacy protections", async () => {
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options"]) assert.match(config, new RegExp(header));
});

test("staging deployments are explicitly noindex", async () => {
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const robots = await readFile(new URL("../app/robots.ts", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(config, /X-Robots-Tag/);
  assert.match(layout, /isStagingDeployment/);
  assert.match(robots, /disallow: "\/"/);
  assert.match(sitemap, /return \[\]/);
});
