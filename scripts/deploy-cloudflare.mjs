import { spawnSync } from "node:child_process";
import { readCloudflareConfig } from "./validate-cloudflare-environment.mjs";

const stage = process.env.RPK_DEPLOYMENT_STAGE?.trim();
if (stage !== "staging" && stage !== "production") {
  console.error("RPK_DEPLOYMENT_STAGE must be staging or production.");
  process.exit(1);
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The Cloudflare Vite plugin selects its environment at build time. Wrangler
// then deploys that exact environment. Keeping both selectors identical avoids
// building staging and accidentally uploading it as production (or vice versa).
run("npm", ["run", "validate:cloudflare-env"]);
run("npm", ["run", "build:production"], { CLOUDFLARE_ENV: stage });
const config = await readCloudflareConfig();
if (stage === "production" && config.env.production.d1_databases.some(entry => entry.binding === "A4_OVERFLOW_DB")) {
  const args = ["--no-install", "wrangler", "d1", "migrations"];
  const standby = ["A4_OVERFLOW_DB", "--remote", "--config", "wrangler.production.jsonc", "--env", stage];
  run("npx", [...args, "apply", ...standby]);
  run("npx", [...args, "list", ...standby]);
  run("npx", ["--no-install", "wrangler", "d1", "execute", ...standby,
    "--command", "SELECT EXISTS(SELECT 1 FROM a4_generation LIMIT 1) AS has_generation", "--json"]);
}
run("npx", ["--no-install", "wrangler", "deploy", "--config", "wrangler.production.jsonc", "--env", stage], {
  CLOUDFLARE_ENV: stage,
});
