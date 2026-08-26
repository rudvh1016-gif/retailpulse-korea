import { spawnSync } from "node:child_process";

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
run("npx", ["--no-install", "wrangler", "deploy", "--config", "wrangler.production.jsonc", "--env", stage], {
  CLOUDFLARE_ENV: stage,
});
