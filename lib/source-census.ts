/**
 * One derived census of every source Production actually collects.
 *
 * The problem this closes
 * ──────────────────────
 * Twice in two days a live source turned out to be missing from the harness's
 * idea of what exists. `KASI_PUBLIC_HOLIDAYS` carried incidents in Production
 * while the diagnostic table had never heard of it; fixing the count to look at
 * sources SEEN rather than sources TABULATED immediately exposed a second,
 * `INCHEON_TRANSFER_FORECAST`. Both were written by real collectors. Neither
 * was in the table those collectors were supposed to be listed in.
 *
 * The failure mode is specific and worth naming: the harness inspected
 * eighteen sources, found all eighteen fine, and reported full coverage — while
 * a nineteenth was collecting, failing, and invisible. "18/18" was true and
 * useless, because the denominator was the thing that was wrong.
 *
 * What this module is, and is not
 * ───────────────────────────────
 * It is NOT a new registry. Registries are exactly what produced the problem:
 * several hand-kept lists that drift. Every id here is DERIVED from the code
 * that collects it —
 *
 *   · `DEFAULT_RUNNERS` in lib/production-runner.ts, through the
 *     `DIAGNOSTIC_SOURCE_IDS` mapping that tests/production-runner.test.mjs
 *     already pins to those same keys, and
 *   · a short list of collectors that write `source_health` directly without
 *     going through the runner, each carrying `declaredBy`: the module that
 *     actually writes it, asserted by test.
 *
 * and the census then compares that derivation against what Production D1
 * really contains. Disagreement is reported, never averaged away.
 *
 * Pure: no D1 handle, no fetch. It is given the observed ids and returns a
 * verdict.
 */
import { DIAGNOSTIC_SOURCE_IDS } from "./production-diagnostics";
import { PRODUCTION_SOURCE_NAMES } from "./production-runner";

/** A source that reaches D1 without passing through `DEFAULT_RUNNERS`. */
export interface DirectCollector {
  sourceId: string;
  /** The module that writes this source's `source_health`. Asserted by test. */
  declaredBy: string;
  reason: string;
}

/**
 * Collectors outside the production runner.
 *
 * Each entry names the file that writes it, and a test reads that file to
 * confirm the id really appears there — so this cannot become a list of
 * plausible-sounding ids nobody collects.
 */
export const DIRECT_COLLECTORS: readonly DirectCollector[] = [
  {
    sourceId: "KASI_PUBLIC_HOLIDAYS",
    declaredBy: "scripts/collect-production.ts",
    reason: "the holiday calendar is collected by the production script's own `holidays` step, which calls writeSourceHealth directly rather than going through DEFAULT_RUNNERS",
  },
  {
    sourceId: "INCHEON_TRANSFER_FORECAST",
    declaredBy: "lib/transfer-forecast.ts",
    reason: "the official transfer forecast has its own workflow (collect-transfer.yml) and its own logical job, and writes source_health from its own module",
  },
];

/**
 * One integrated request can write more than one canonical source.
 *
 * `seoul_realtime` is a single provider call that lands two independently
 * healthy sources, so the companion has to be censused even though no runner
 * key names it.
 */
export const COMPANION_SOURCE_IDS: readonly string[] = ["SEOUL_CITYDATA_CMRCL"];

export interface CensusEntry {
  sourceId: string;
  /** How this id got into the census: a runner key, a direct collector, or a companion. */
  origin: "PRODUCTION_RUNNER" | "DIRECT_COLLECTOR" | "COMPANION";
  declaredBy: string;
}

/**
 * Every canonical source id Production is known to write, derived from code.
 *
 * Sorted, so the census serialises identically run to run.
 */
export const SOURCE_CENSUS: readonly CensusEntry[] = [
  ...PRODUCTION_SOURCE_NAMES.flatMap((name): CensusEntry[] => {
    const sourceId = (DIAGNOSTIC_SOURCE_IDS as Record<string, string>)[name];
    // A runner whose name has no canonical id is itself a gap, and is reported
    // by `censusSources` rather than silently skipped here.
    return sourceId ? [{ sourceId, origin: "PRODUCTION_RUNNER", declaredBy: "lib/production-runner.ts" }] : [];
  }),
  ...COMPANION_SOURCE_IDS.map((sourceId): CensusEntry => ({
    sourceId, origin: "COMPANION", declaredBy: "lib/production-diagnostics.ts",
  })),
  ...DIRECT_COLLECTORS.map((entry): CensusEntry => ({
    sourceId: entry.sourceId, origin: "DIRECT_COLLECTOR", declaredBy: entry.declaredBy,
  })),
].sort((a, b) => a.sourceId.localeCompare(b.sourceId));

/**
 * Runner keys that are repair windows for an existing source, not sources.
 *
 * `airport_passenger_forecast_recovery` and `weather_recovery` re-request the
 * missing slice of A5 and of the weather grid. `sourceIdsForRun` maps each back
 * to its primary, and they share that primary's logical job and budget. They
 * correctly have no canonical id of their own, so the unmapped check must not
 * read them as holes — which it did until this test caught it.
 */
const RECOVERY_VARIANT = /_recovery$/;

/** Runner keys with no canonical source id — a hole on the derivation side. */
export const UNMAPPED_RUNNER_NAMES: readonly string[] = PRODUCTION_SOURCE_NAMES
  .filter((name) => !RECOVERY_VARIANT.test(name) && !(DIAGNOSTIC_SOURCE_IDS as Record<string, string>)[name])
  .sort();

export const CENSUSED_SOURCE_IDS: readonly string[] = SOURCE_CENSUS.map((entry) => entry.sourceId);

export type CensusVerdict = "COMPLETE" | "SOURCE_COVERAGE_GAP" | "UNMEASURED";

export interface CensusResult {
  verdict: CensusVerdict;
  /** Ids the census derived from code. */
  censused: readonly string[];
  /** Ids Production actually has that the census has never heard of. */
  unregistered: readonly string[];
  /** Censused ids with no classification in the recovery capability matrix. */
  unclassified: readonly string[];
  /** Censused ids with no scheduler/logical-job owner. */
  unowned: readonly string[];
  /** Runner keys with no canonical id. */
  unmappedRunners: readonly string[];
  detail: string;
}

/**
 * Compares the derived census against Production and against the harness's own tables.
 *
 * `observed` is what D1 really has. Passing `null` means the observation could
 * not be made at all — an offline run — and the verdict is UNMEASURED rather
 * than COMPLETE, because "I could not read the list" is not evidence the list
 * matches. That distinction is the whole point: a census that reports COMPLETE
 * when it read nothing is worse than no census.
 *
 * `classifiedIds` and `ownedIds` let the caller supply the recovery capability
 * matrix and the scheduler ownership map without this module importing either,
 * which keeps the dependency direction one-way.
 */
export function censusSources(input: {
  observed: readonly string[] | null;
  classifiedIds: readonly string[];
  ownedIds: readonly string[];
}): CensusResult {
  const censused = CENSUSED_SOURCE_IDS;
  const unclassified = censused.filter((id) => !input.classifiedIds.includes(id));
  const unowned = censused.filter((id) => !input.ownedIds.includes(id));
  const unmappedRunners = UNMAPPED_RUNNER_NAMES;

  if (input.observed === null) {
    return {
      verdict: "UNMEASURED",
      censused, unregistered: [], unclassified, unowned, unmappedRunners,
      detail: "Production source ids could not be read, so the census cannot claim to be complete",
    };
  }
  const unregistered = [...new Set(input.observed)].filter((id) => !censused.includes(id)).sort();
  const gaps = unregistered.length + unclassified.length + unowned.length + unmappedRunners.length;
  if (gaps > 0) {
    const parts = [
      unregistered.length ? `${unregistered.length} collecting in Production but absent from the census (${unregistered.join(", ")})` : "",
      unclassified.length ? `${unclassified.length} with no recovery classification (${unclassified.join(", ")})` : "",
      unowned.length ? `${unowned.length} with no scheduler owner (${unowned.join(", ")})` : "",
      unmappedRunners.length ? `${unmappedRunners.length} runner name(s) with no canonical id (${unmappedRunners.join(", ")})` : "",
    ].filter(Boolean);
    return {
      verdict: "SOURCE_COVERAGE_GAP",
      censused, unregistered, unclassified, unowned, unmappedRunners,
      detail: `SOURCE_COVERAGE_GAP: ${parts.join("; ")}`,
    };
  }
  return {
    verdict: "COMPLETE",
    censused, unregistered: [], unclassified: [], unowned: [], unmappedRunners: [],
    detail: `all ${censused.length} censused sources are registered, classified and owned`,
  };
}

/**
 * The severity a coverage gap carries into the overall health verdict.
 *
 * A gap is ERROR, not a warning. The harness's entire job is to know what it is
 * watching; a source it does not know about is one it cannot report on, and
 * every "all clear" it prints while that is true is wrong. UNMEASURED is
 * UNKNOWN — honest, and still not HEALTHY.
 */
export function censusSeverity(verdict: CensusVerdict): "HEALTHY" | "UNKNOWN" | "ERROR" {
  if (verdict === "COMPLETE") return "HEALTHY";
  if (verdict === "UNMEASURED") return "UNKNOWN";
  return "ERROR";
}
