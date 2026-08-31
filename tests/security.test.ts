import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { redactDataGoKrSecrets } from "../lib/data-go-kr.mjs";
import { redirectHttpToHttps } from "../worker/https-redirect";

test("data.go.kr diagnostics redact decoded, encoded, and keyed URL forms", () => {
  const decoded = "sample+/key==";
  const encoded = "sample%2B%2Fkey%3D%3D";
  const diagnostic = [
    decoded,
    encoded,
    `https://apis.data.go.kr/example?serviceKey=${encoded}&pageNo=1`,
  ].join(" | ");
  const redacted = redactDataGoKrSecrets(diagnostic, encoded);

  assert.doesNotMatch(redacted, /sample/);
  assert.doesNotMatch(redacted, /serviceKey=(?!\[REDACTED\])/);
  assert.match(redacted, /\[REDACTED\]/);
});

test("Worker redirects HTTP requests to the same HTTPS URL", () => {
  const response = redirectHttpToHttps(new Request("http://koretaildata.com/ko?source=domain-check"));

  assert.equal(response?.status, 308);
  assert.equal(response?.headers.get("location"), "https://koretaildata.com/ko?source=domain-check");
});

test("Worker leaves HTTPS requests unchanged", () => {
  assert.equal(redirectHttpToHttps(new Request("https://koretaildata.com/ko")), undefined);
});

test("Worker leaves loopback HTTP requests available for local rendering", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "terminal.local"]) {
    assert.equal(redirectHttpToHttps(new Request(`http://${host}/ko`)), undefined);
  }
});

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

test("manual S2 import stays confirmed, bounded, isolated, and unscheduled", async () => {
  const script = await readFile(new URL("../scripts/import-oneshot.ts", import.meta.url), "utf8");
  const collector = await readFile(new URL("../lib/collector.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/import-oneshot.yml", import.meta.url), "utf8");

  assert.match(script, /RPK_ONESHOT_CONFIRM !== "IMPORT"/);
  assert.ok(script.indexOf("RPK_ONESHOT_CONFIRM") < script.indexOf("new CloudflareD1RestDatabase"));
  assert.match(script, /seoul_foreign:\s*\(\)\s*=>\s*collectSeoulForeignPresence\(env\)/);
  assert.match(collector, /configuredCodes.*new Set/);
  assert.doesNotMatch(collector, /1\/1\//);
  assert.match(collector, /SEOUL_FOREIGN_PERIOD_LOOKBACK_DAYS = 62/);
  assert.match(collector, /1\/1000\/\$\{candidate\.ymd\}\/\$\{candidate\.tt\}\/\$\{code\}/);
  assert.match(workflow, /seoul_foreign/);
  assert.doesNotMatch(workflow, /^\s*schedule:/m);

  const rejected = spawnSync(process.execPath, ["--import", "tsx", "scripts/import-oneshot.ts"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, RPK_ONESHOT_CONFIRM: "NO" },
    encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stdout}${rejected.stderr}`, /oneshot_not_confirmed/);
});
