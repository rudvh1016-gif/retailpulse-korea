import { readFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../wrangler.production.jsonc", import.meta.url);
const PLACEHOLDER_IDS = new Set([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
]);

export async function readCloudflareConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

export function validateCloudflareEnvironment(config, stage) {
  if (stage !== "staging" && stage !== "production") {
    throw new Error("RPK_DEPLOYMENT_STAGE must be staging or production.");
  }
  if (!/^[a-f0-9]{32}$/.test(config.account_id ?? "")) {
    throw new Error("Wrangler account_id must be a 32-character hexadecimal account_id.");
  }

  const staging = config.env?.staging;
  const production = config.env?.production;
  if (!staging || !production) throw new Error("Both Wrangler environments must exist.");
  if (staging.name === production.name) throw new Error("Staging and production Worker names must differ.");

  const stagingDb = staging.d1_databases?.find((entry) => entry.binding === "DB");
  const productionDb = production.d1_databases?.find((entry) => entry.binding === "DB");
  if (!stagingDb || !productionDb) throw new Error("Both environments must bind D1 as DB.");
  if (stagingDb.database_name === productionDb.database_name) {
    throw new Error("Staging and production must use different D1 databases.");
  }

  const selected = stage === "staging" ? staging : production;
  const selectedDb = stage === "staging" ? stagingDb : productionDb;
  if (selected.vars?.APP_ENV !== stage) throw new Error(`${stage} APP_ENV is inconsistent.`);
  if (selected.vars?.ENABLE_BETA_SIGNUPS !== "false") {
    throw new Error("Beta signup must remain disabled during infrastructure validation.");
  }
  if (PLACEHOLDER_IDS.has(selectedDb.database_id)) {
    throw new Error(
      `${stage} D1 is not created. Replace only its placeholder database_id after Cloudflare authentication.`,
    );
  }
  return { workerName: selected.name, databaseName: selectedDb.database_name };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const stage = process.env.RPK_DEPLOYMENT_STAGE?.trim();
    const result = validateCloudflareEnvironment(await readCloudflareConfig(), stage);
    console.log(`${stage} Cloudflare environment validated: ${result.workerName} -> ${result.databaseName}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cloudflare environment validation failed.");
    process.exit(1);
  }
}
