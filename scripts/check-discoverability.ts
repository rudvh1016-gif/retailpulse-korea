/**
 * CLI for lib/discoverability.ts — read-only, credential-free.
 *
 *   npm run check:discoverability -- --origin=https://koretaildata.com
 *
 * Exits non-zero when the live site is not findable, so a workflow fails
 * loudly instead of a de-indexing being discovered weeks later in traffic.
 */
import { runDiscoverabilityChecks, summarizeDiscoverability } from "../lib/discoverability";

const fromArgument = process.argv.find((value) => value.startsWith("--origin="))?.slice("--origin=".length);
const origin = (fromArgument ?? process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "").trim();
if (!origin) {
  console.error("Pass --origin=https://… or set NEXT_PUBLIC_SITE_ORIGIN.");
  process.exit(2);
}

const report = await runDiscoverabilityChecks({ origin });
console.log(summarizeDiscoverability(report));
if (!report.ok) process.exitCode = 1;
