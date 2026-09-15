/**
 * Turns one cycle's collector output into the retry job's inputs.
 *
 * Reads the log file named on argv, appends `retry_sources` to $GITHUB_OUTPUT
 * (empty when nothing qualifies) and prints the per-source verdict so the job
 * log states why a request was or was not spent.
 *
 * It never fails the job: a decision that cannot be made is an empty
 * `retry_sources`, which spends nothing — the safe direction.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { decideCongestionRetry, RETRYABLE_A4_SOURCES } from "../lib/congestion-retry";

const path = process.argv[2];
let log = "";
try {
  log = readFileSync(path, "utf8");
} catch (error) {
  console.log(`collector log unreadable (${(error as Error).message}); no fresh runner will be requested`);
}

const decision = decideCongestionRetry(log);
for (const item of decision.decisions) console.log(`${item.source}: ${item.verdict} — ${item.detail}`);

// Defence in depth: only ever emit names from the fixed allowlist, so nothing
// derived from provider output can reach the retry job's `sources` input.
const safe = decision.sources.filter((source) => (RETRYABLE_A4_SOURCES as readonly string[]).includes(source));
const value = safe.join(",");
console.log(`retry_sources=${value || "(none)"}`);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `retry_sources=${value}\n`);
