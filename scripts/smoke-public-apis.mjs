// PROBE BRANCH ONLY: never merge. On branch claude/airport-api-probe-20261014
// the manually dispatched "Smoke Public APIs" workflow runs the bounded,
// read-only probe for 15095071 / 15095070 / 15114085 instead of the ordinary
// smoke: one request per service, three in total, no retry, nothing written.
// PR #369 used the same route. main keeps the ordinary smoke entry.
import { runIncheonStatsProbeCli } from "./probe-incheon-airport-stats.mjs";

await runIncheonStatsProbeCli();
