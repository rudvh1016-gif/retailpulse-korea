import { collectAirportFlights, pruneOperationalHistory } from "../lib/collector";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

if (process.env.ENABLE_PRODUCTION_COLLECTOR !== "true") {
  throw new Error("production_collector_not_enabled");
}

const database = new CloudflareD1RestDatabase(
  required("CLOUDFLARE_ACCOUNT_ID"),
  required("CLOUDFLARE_D1_DATABASE_ID"),
  required("CLOUDFLARE_D1_WRITE_TOKEN"),
);

const result = await collectAirportFlights({
  DB: database as unknown as D1Database,
  DATA_GO_KR_SERVICE_KEY: required("DATA_GO_KR_SERVICE_KEY"),
  retainChangeHistory: process.env.RPK_RETAIN_FLIGHT_CHANGE_HISTORY === "true",
});

console.log(JSON.stringify({ sourceId: "INCHEON_FLIGHT_DETAIL", status: result.status, changedRows: result.records }));
if (result.status !== "SUCCESS") process.exitCode = 1;

const now = new Date();
if ((now.getUTCHours() + 9) % 24 === 3) {
  const prunedRows = await pruneOperationalHistory(database as unknown as D1Database, now);
  console.log(JSON.stringify({ maintenance: "retention", prunedRows }));
}
