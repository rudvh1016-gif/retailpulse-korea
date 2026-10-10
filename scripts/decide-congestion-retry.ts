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
import { decideCongestionRetry, RETRYABLE_A4_SOURCES, shouldRetryForecast, shouldRetryAirport, shouldRecheckAirportPublication } from "../lib/congestion-retry";

const path = process.argv[2];
let log = "";
try {
  log = readFileSync(path, "utf8");
} catch {
  console.log("collector log unreadable; no fresh runner will be requested");
}

if (process.argv[3] === "--airport") {
  const retry = shouldRetryAirport(log);
  const publication = shouldRecheckAirportPublication(log);
  console.log(`retry_airport=${retry}`);
  console.log(`recheck_airport_publication=${publication}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `retry_airport=${retry}\nrecheck_airport_publication=${publication}\n`);
} else if (process.argv[3] === "--forecast") {
  const retry = shouldRetryForecast(log);
  console.log(`retry_forecast=${retry}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `retry_forecast=${retry}\n`);
} else {

  const decision = decideCongestionRetry(log);
  for (const item of decision.decisions) console.log(`${item.source}: ${item.verdict} — ${item.detail}`);

// Defence in depth: only ever emit names from the fixed allowlist, so nothing
// derived from provider output can reach the retry job's `sources` input.
  const safe = decision.sources.filter((source) => (RETRYABLE_A4_SOURCES as readonly string[]).includes(source));
  const value = safe.join(",");
  console.log(`retry_sources=${value || "(none)"}`);

  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `retry_sources=${value}\n`);
}
