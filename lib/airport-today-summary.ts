export interface AirportForecastAggregateRow {
  terminal: string;
  direction: string;
  isAggregate: number;
  targetDate: string;
  timeBandRaw: string;
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
  retrievedAt: string;
}

export interface AirportTodayFlightRow {
  physicalFlightId: string;
  terminal: string | null;
  gate: string | null;
  retrievedAt: string;
}

export interface AirportCongestionSummaryRow {
  terminal: string;
  zone: string;
  waitTimeMinutes: number | null;
  waitTimeRaw: string | null;
  waitingCount: number | null;
  observedAt: string;
  freshness?: "LIVE" | "STALE";
}

export interface ForecastBand {
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
}

export type PassengerForecastDirection = "departure" | "arrival";

/**
 * A5 daily-total/peak honesty gate (see docs/DATA_SOURCES.md):
 * - COMPLETE: the terminal's official aggregate bands cover the full KST
 *   service day with no gap, overlap, or duplicate — a daily total/peak is
 *   safe to present as the whole day.
 * - PARTIAL: at least one official band exists, but coverage cannot be
 *   proven for the full day — a missing band could hide the true peak, so a
 *   daily total/peak must not be shown.
 * - UNAVAILABLE: no official aggregate band exists at all.
 */
export type ForecastCoverageStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export interface ForecastCoverage {
  all: ForecastCoverageStatus;
  byTerminal: Record<string, ForecastCoverageStatus>;
}

export interface TodayPassengerForecastSummary {
  /** All-airport daily total. Only non-null when `coverage.all` is COMPLETE. */
  total: number | null;
  /** Per-terminal daily total. Only non-null when that terminal is COMPLETE. */
  totalByTerminal: Record<string, number | null>;
  /** All-airport peak band. Only non-null when `coverage.all` is COMPLETE. */
  peak: ForecastBand | null;
  peakByTerminal: Record<string, ForecastBand | null>;
  /** All-airport timeline. Empty unless `coverage.all` is COMPLETE. */
  timeline: ForecastBand[];
  timelineByTerminal: Record<string, ForecastBand[]>;
  retrievedAt: string | null;
  retrievedAtByTerminal: Record<string, string | null>;
  coverage: ForecastCoverage;
}

function nextKstDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

interface TerminalCoverageResult {
  status: ForecastCoverageStatus;
  intervals: ForecastBand[];
  retrievedAt: string | null;
}

/**
 * Validates one terminal's official aggregate bands against the KST service
 * day. Never trusts raw provider row count alone — every interval must be
 * distinct, positive-duration, gapless, and anchored to the 00:00-00:00 KST
 * boundary before the terminal is COMPLETE.
 */
function evaluateTerminalCoverage(rows: AirportForecastAggregateRow[], serviceDateKst: string): TerminalCoverageResult {
  const byKey = new Map<string, ForecastBand>();
  let hadDuplicate = false;
  let retrievedAt: string | null = null;
  for (const row of rows) {
    const key = `${row.targetStartAt}|${row.targetEndAt}`;
    // A duplicate interval is never summed twice — only its first occurrence
    // is kept, and the duplicate itself disqualifies COMPLETE status below.
    if (byKey.has(key)) {
      hadDuplicate = true;
    } else {
      byKey.set(key, { targetStartAt: row.targetStartAt, targetEndAt: row.targetEndAt, expectedPassengers: Number(row.expectedPassengers) });
    }
    if (!retrievedAt || row.retrievedAt > retrievedAt) retrievedAt = row.retrievedAt;
  }
  const intervals = [...byKey.values()].sort((a, b) => a.targetStartAt.localeCompare(b.targetStartAt));
  if (intervals.length === 0) return { status: "UNAVAILABLE", intervals, retrievedAt };

  const dayStart = `${serviceDateKst}T00:00:00+09:00`;
  const dayEnd = `${nextKstDate(serviceDateKst)}T00:00:00+09:00`;
  let valid = !hadDuplicate;
  for (const interval of intervals) {
    const startMs = Date.parse(interval.targetStartAt);
    const endMs = Date.parse(interval.targetEndAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) valid = false;
  }
  for (let i = 1; i < intervals.length; i += 1) {
    if (intervals[i - 1].targetEndAt !== intervals[i].targetStartAt) valid = false;
  }
  if (intervals[0].targetStartAt !== dayStart) valid = false;
  if (intervals.at(-1)!.targetEndAt !== dayEnd) valid = false;

  return { status: valid ? "COMPLETE" : "PARTIAL", intervals, retrievedAt };
}

/**
 * Summarizes A5 official aggregate rows for one direction. `serviceDateKst` anchors
 * the full-day boundary check; when omitted it falls back to the first
 * row's own targetDate (rows are expected to already be scoped to one day).
 * A daily total/peak/timeline is produced only for terminals (and, for the
 * all-airport figure, only when both T1 and T2) prove full-day coverage —
 * see `evaluateTerminalCoverage`. Component rows (isAggregate=0) never enter
 * this calculation, preventing provider-total double count.
 */
export function summarizePassengerForecast(
  rows: AirportForecastAggregateRow[],
  serviceDateKst?: string,
  direction: PassengerForecastDirection = "departure",
): TodayPassengerForecastSummary {
  const official = rows.filter((row) => row.direction === direction && row.isAggregate === 1);
  const effectiveDate = serviceDateKst ?? official[0]?.targetDate ?? null;

  const rowsByTerminal = new Map<string, AirportForecastAggregateRow[]>();
  for (const row of official) {
    const list = rowsByTerminal.get(row.terminal) ?? [];
    list.push(row);
    rowsByTerminal.set(row.terminal, list);
  }
  const terminals = [...rowsByTerminal.keys()].sort();

  const coverageByTerminal: Record<string, ForecastCoverageStatus> = {};
  const totalByTerminal: Record<string, number | null> = {};
  const peakByTerminal: Record<string, ForecastBand | null> = {};
  const timelineByTerminal: Record<string, ForecastBand[]> = {};
  const retrievedAtByTerminal: Record<string, string | null> = {};
  const intervalsByTerminal = new Map<string, ForecastBand[]>();

  for (const terminal of terminals) {
    const evaluated = effectiveDate
      ? evaluateTerminalCoverage(rowsByTerminal.get(terminal)!, effectiveDate)
      : { status: "UNAVAILABLE" as const, intervals: [], retrievedAt: null };
    coverageByTerminal[terminal] = evaluated.status;
    intervalsByTerminal.set(terminal, evaluated.intervals);
    retrievedAtByTerminal[terminal] = evaluated.retrievedAt;
    if (evaluated.status === "COMPLETE") {
      totalByTerminal[terminal] = evaluated.intervals.reduce((sum, band) => sum + band.expectedPassengers, 0);
      peakByTerminal[terminal] = evaluated.intervals.reduce<ForecastBand | null>(
        (best, band) => (!best || band.expectedPassengers > best.expectedPassengers ? band : best),
        null,
      );
      timelineByTerminal[terminal] = evaluated.intervals.map((band) => ({ ...band }));
    } else {
      totalByTerminal[terminal] = null;
      peakByTerminal[terminal] = null;
      timelineByTerminal[terminal] = [];
    }
  }

  // All-airport figures require BOTH T1 and T2 to be COMPLETE with matching
  // band grids, so combining them never allocates or assumes a split.
  const t1Intervals = intervalsByTerminal.get("T1") ?? [];
  const t2Intervals = intervalsByTerminal.get("T2") ?? [];
  const t1Status = coverageByTerminal.T1 ?? "UNAVAILABLE";
  const t2Status = coverageByTerminal.T2 ?? "UNAVAILABLE";
  const bothComplete = t1Status === "COMPLETE" && t2Status === "COMPLETE";
  const gridsMatch = bothComplete
    && t1Intervals.length === t2Intervals.length
    && t1Intervals.every((band, index) => band.targetStartAt === t2Intervals[index].targetStartAt && band.targetEndAt === t2Intervals[index].targetEndAt);

  let allStatus: ForecastCoverageStatus;
  if (terminals.length === 0) allStatus = "UNAVAILABLE";
  else if (bothComplete && gridsMatch) allStatus = "COMPLETE";
  else if (t1Status === "UNAVAILABLE" && t2Status === "UNAVAILABLE") allStatus = "UNAVAILABLE";
  else allStatus = "PARTIAL";

  let total: number | null = null;
  let peak: ForecastBand | null = null;
  let timeline: ForecastBand[] = [];
  if (allStatus === "COMPLETE") {
    timeline = t1Intervals.map((band, index) => ({
      targetStartAt: band.targetStartAt,
      targetEndAt: band.targetEndAt,
      expectedPassengers: band.expectedPassengers + t2Intervals[index].expectedPassengers,
    }));
    total = timeline.reduce((sum, band) => sum + band.expectedPassengers, 0);
    peak = timeline.reduce<ForecastBand | null>(
      (best, band) => (!best || band.expectedPassengers > best.expectedPassengers ? band : best),
      null,
    );
  }

  const retrievedAt = Object.values(retrievedAtByTerminal)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    total,
    totalByTerminal,
    peak,
    peakByTerminal,
    timeline,
    timelineByTerminal,
    retrievedAt,
    retrievedAtByTerminal,
    coverage: { all: allStatus, byTerminal: coverageByTerminal },
  };
}

/** Existing Airport contract: its A5 view remains departure-specific. */
export function summarizeTodayPassengerForecast(
  rows: AirportForecastAggregateRow[],
  serviceDateKst?: string,
): TodayPassengerForecastSummary {
  return summarizePassengerForecast(rows, serviceDateKst, "departure");
}

/**
 * The first official, non-ended whole-airport band for one A5 direction.
 *
 * Unlike a full-day total, this local band does not require every hour of the
 * day to be present. It does require one and only one official aggregate row
 * from both T1 and T2 on the exact same interval. A missing, duplicate or
 * mismatched terminal row fails closed instead of creating a partial airport
 * number.
 */
export function summarizeNextPassengerForecastBand(
  rows: AirportForecastAggregateRow[],
  direction: PassengerForecastDirection,
  nowIso: string,
): ForecastBand | null {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;

  const intervals = new Map<string, Map<string, number[]>>();
  for (const row of rows) {
    if (row.direction !== direction || row.isAggregate !== 1) continue;
    if (row.terminal !== "T1" && row.terminal !== "T2") continue;
    const start = Date.parse(row.targetStartAt);
    const end = Date.parse(row.targetEndAt);
    const passengers = Number(row.expectedPassengers);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now) continue;
    if (!Number.isFinite(passengers) || passengers < 0) continue;
    const key = `${row.targetStartAt}|${row.targetEndAt}`;
    const byTerminal = intervals.get(key) ?? new Map<string, number[]>();
    byTerminal.set(row.terminal, [...(byTerminal.get(row.terminal) ?? []), passengers]);
    intervals.set(key, byTerminal);
  }

  for (const [key, byTerminal] of [...intervals.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const t1 = byTerminal.get("T1") ?? [];
    const t2 = byTerminal.get("T2") ?? [];
    if (t1.length !== 1 || t2.length !== 1) continue;
    const [targetStartAt, targetEndAt] = key.split("|");
    return { targetStartAt, targetEndAt, expectedPassengers: t1[0] + t2[0] };
  }
  return null;
}

export interface RemainingForecast {
  /** Official expected departures from the current hour band through the end of the KST day. */
  expectedPassengers: number;
  /** First band counted — always a whole band start, never a pro-rated partial hour. */
  fromAt: string;
  /** End of the KST service day. */
  toAt: string;
  bands: number;
}

/**
 * "From the current hour to the end of today, how many departures does the
 * official forecast still expect?"
 *
 * Only whole official bands are summed. The in-progress hour is counted in
 * full and the returned `fromAt` says so, because pro-rating it by the
 * minutes already elapsed would invent a number the provider never published.
 *
 * Returns null unless the day's coverage is COMPLETE. With a missing band the
 * remainder would silently understate the true figure, and a number that is
 * quietly too low is worse than no number at all.
 */
export function summarizeRemainingPassengerForecast(
  timeline: ForecastBand[],
  coverage: ForecastCoverageStatus,
  nowIso: string,
): RemainingForecast | null {
  if (coverage !== "COMPLETE" || timeline.length === 0) return null;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;
  const remaining = timeline.filter((band) => Date.parse(band.targetEndAt) > now);
  if (remaining.length === 0) return null;
  return {
    expectedPassengers: remaining.reduce((sum, band) => sum + band.expectedPassengers, 0),
    fromAt: remaining[0].targetStartAt,
    toAt: remaining.at(-1)!.targetEndAt,
    bands: remaining.length,
  };
}

export interface GateSummaryForScope {
  departuresTrackedToday: number | null;
  gateCoverageRatio: number;
  topDepartureGate: { terminal: string | null; gate: string; flights: number } | null;
  busyDepartureGates: Array<{ terminal: string | null; gate: string; flights: number }>;
  retrievedAt: string | null;
}

function computeGateSummary(rows: AirportTodayFlightRow[], minimumCoverage: number, totalOverride?: number): GateSummaryForScope {
  const physical = new Map<string, AirportTodayFlightRow>();
  for (const row of rows) {
    const current = physical.get(row.physicalFlightId);
    if (!current || (!current.gate?.trim() && row.gate?.trim())) physical.set(row.physicalFlightId, row);
  }
  const flights = [...physical.values()];
  const withGate = flights.filter((row) => row.gate?.trim());
  const total = totalOverride ?? flights.length;
  const coverage = total ? withGate.length / total : 0;
  const counts = new Map<string, { terminal: string | null; gate: string; flights: number }>();
  for (const row of withGate) {
    const gate = row.gate!.trim();
    const key = `${row.terminal ?? ""}|${gate}`;
    const current = counts.get(key) ?? { terminal: row.terminal, gate, flights: 0 };
    current.flights += 1;
    counts.set(key, current);
  }
  const ranked = [...counts.values()].sort((a, b) => b.flights - a.flights || `${a.terminal}${a.gate}`.localeCompare(`${b.terminal}${b.gate}`));
  const top = ranked[0] ?? null;
  const retrievedAt = rows.reduce<string | null>((latest, row) => (!latest || row.retrievedAt > latest ? row.retrievedAt : latest), null);
  return {
    departuresTrackedToday: total || null,
    gateCoverageRatio: coverage,
    topDepartureGate: top && coverage >= minimumCoverage ? top : null,
    busyDepartureGates: coverage >= minimumCoverage ? ranked.slice(0, 5) : [],
    retrievedAt,
  };
}

/** All-airport departures-tracked/top-gate summary (unchanged behavior). */
export function summarizeTodayTopGate(rows: AirportTodayFlightRow[], minimumCoverage = 0.5, totalDistinctFlights?: number): GateSummaryForScope {
  return computeGateSummary(rows, minimumCoverage, totalDistinctFlights);
}

/**
 * Per-terminal departures-tracked/top-gate summary. Each terminal's gate
 * coverage ratio and top gate are computed against ONLY that terminal's
 * flights — a T1 selection can never be won by a T2 gate, and the coverage
 * denominator is the T1 flight count, not the all-airport count. Rows with
 * a null/unknown terminal are excluded rather than guessed at.
 */
export function summarizeTodayTopGateByTerminal(
  rows: AirportTodayFlightRow[],
  minimumCoverage = 0.5,
  totalDistinctFlightsByTerminal?: Record<string, number>,
): Record<string, GateSummaryForScope> {
  const rowsByTerminal = new Map<string, AirportTodayFlightRow[]>();
  for (const row of rows) {
    if (!row.terminal) continue;
    const list = rowsByTerminal.get(row.terminal) ?? [];
    list.push(row);
    rowsByTerminal.set(row.terminal, list);
  }
  const result: Record<string, GateSummaryForScope> = {};
  for (const [terminal, terminalRows] of rowsByTerminal) {
    result[terminal] = computeGateSummary(terminalRows, minimumCoverage, totalDistinctFlightsByTerminal?.[terminal]);
  }
  return Object.fromEntries(Object.entries(result).sort());
}

/** Parses a non-exact wait-time string into a comparable lower-bound minute value, e.g. "60+" -> 60, "24" -> 24. */
function parseWaitTimeRaw(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/** A comparable wait-time metric: exact minutes first, then a safely parsed raw string. Never derived from waitingCount. */
function comparableWaitTime(row: AirportCongestionSummaryRow): number | null {
  if (typeof row.waitTimeMinutes === "number" && Number.isFinite(row.waitTimeMinutes)) return row.waitTimeMinutes;
  return parseWaitTimeRaw(row.waitTimeRaw);
}

/**
 * Picks the busiest current departure-hall checkpoint per terminal.
 *
 * Minutes and people are never compared to each other. Within a terminal, if
 * ANY checkpoint has a comparable wait-time value, the winner is chosen only
 * among checkpoints that have one (a waitingCount-only row cannot win just
 * because its people count is numerically larger). Only when NO checkpoint
 * in the terminal has any usable wait-time metric does the comparison fall
 * back to waitingCount. Ties break deterministically: wait time, then
 * waiting count, then zone name — never randomly.
 */
export function summarizeCurrentBusiestDepartureHalls(rows: AirportCongestionSummaryRow[]) {
  const rowsByTerminal = new Map<string, AirportCongestionSummaryRow[]>();
  for (const row of rows) {
    const list = rowsByTerminal.get(row.terminal) ?? [];
    list.push(row);
    rowsByTerminal.set(row.terminal, list);
  }
  const result: Record<string, AirportCongestionSummaryRow> = {};
  for (const [terminal, terminalRows] of rowsByTerminal) {
    const withWaitTime = terminalRows
      .map((row) => ({ row, waitTime: comparableWaitTime(row) }))
      .filter((entry): entry is { row: AirportCongestionSummaryRow; waitTime: number } => entry.waitTime !== null);
    const candidates = withWaitTime.length > 0
      ? withWaitTime
      : terminalRows.map((row) => ({ row, waitTime: null as number | null }));
    const winner = [...candidates].sort((a, b) => {
      const waitDiff = (b.waitTime ?? -1) - (a.waitTime ?? -1);
      if (waitDiff !== 0) return waitDiff;
      const countDiff = (b.row.waitingCount ?? -1) - (a.row.waitingCount ?? -1);
      if (countDiff !== 0) return countDiff;
      return a.row.zone.localeCompare(b.row.zone);
    })[0];
    result[terminal] = winner.row;
  }
  return Object.fromEntries(Object.entries(result).sort());
}

/**
 * Sorts current checkpoints inside each terminal using the same honest
 * comparison rule as the busiest-checkpoint summary. Minutes always win when
 * that terminal has any comparable wait-time data; people are only the
 * fallback when the whole terminal has no usable wait time.
 */
export function rankCurrentDepartureHallCheckpoints(rows: AirportCongestionSummaryRow[]) {
  const rowsByTerminal = new Map<string, AirportCongestionSummaryRow[]>();
  for (const row of rows) {
    const list = rowsByTerminal.get(row.terminal) ?? [];
    list.push(row);
    rowsByTerminal.set(row.terminal, list);
  }
  const ranked: Record<string, AirportCongestionSummaryRow[]> = {};
  for (const [terminal, terminalRows] of rowsByTerminal) {
    const terminalHasWaitTime = terminalRows.some((row) => comparableWaitTime(row) !== null);
    ranked[terminal] = [...terminalRows].sort((a, b) => {
      if (terminalHasWaitTime) {
        const waitDiff = (comparableWaitTime(b) ?? -1) - (comparableWaitTime(a) ?? -1);
        if (waitDiff !== 0) return waitDiff;
      } else {
        const countDiff = (b.waitingCount ?? -1) - (a.waitingCount ?? -1);
        if (countDiff !== 0) return countDiff;
      }
      const secondaryCountDiff = (b.waitingCount ?? -1) - (a.waitingCount ?? -1);
      if (secondaryCountDiff !== 0) return secondaryCountDiff;
      return a.zone.localeCompare(b.zone);
    });
  }
  return Object.fromEntries(Object.entries(ranked).sort());
}

export type AirportDisplayLang = "ko" | "en" | "zh" | "ja";

/** Provider-safe display mapping. Only identifiers with a proven structural pattern are expanded. */
export function friendlyCheckpointName(zone: string, lang: AirportDisplayLang): string {
  const dg = zone.match(/^DG(\d+)_([A-Z0-9]+)$/i);
  if (dg) {
    const name = `${dg[1]}${dg[2].toUpperCase()}`;
    return lang === "ko" ? `출국장 ${name}` : lang === "en" ? `Departure hall ${name}` : lang === "zh" ? `出境区 ${name}` : `出国場 ${name}`;
  }
  const p = zone.match(/^P(\d+)$/i);
  if (p) {
    const name = `P${p[1].padStart(2, "0")}`;
    return lang === "ko" ? `출국장 ${name}` : lang === "en" ? `Departure hall ${name}` : lang === "zh" ? `出境区 ${name}` : `出国場 ${name}`;
  }
  return zone;
}
