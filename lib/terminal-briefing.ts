/**
 * Terminal briefing — "where to watch now", one card per terminal.
 *
 * Built ONLY from data the public summary already carries: the current
 * observed departure-hall queues (A4), the official expected-passenger
 * timeline (A5) and the physical departures with their busiest gate (A1).
 * No provider is called and no score is invented: every field on a card is
 * an official value with its own kind (observed queue, official forecast,
 * counted flights), and the one "attention" pick is a plain comparison of
 * observed waits first, forecast next-band size second, never a blend.
 */
import {
  type AirportBriefCheckpoint,
  type AirportBriefGate,
  type AirportBriefPeak,
  type BriefCoverage,
} from "./current-brief";

export interface TerminalForecastBand {
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
}

export interface TerminalRemaining {
  expectedPassengers: number;
  fromAt: string;
  toAt: string;
  bands: number;
}

export interface TerminalBriefingInput {
  terminals: string[];
  /** Current observed checkpoint rows for every terminal (A4, observed). */
  congestion: AirportBriefCheckpoint[];
  /** Official expected-passenger bands per terminal for the service day (A5, forecast). */
  timelineByTerminal: Record<string, TerminalForecastBand[]>;
  coverageByTerminal: Record<string, BriefCoverage>;
  peakByTerminal: Record<string, AirportBriefPeak | null>;
  remainingByTerminal: Record<string, TerminalRemaining | null>;
  /** Physical departures counted today per terminal and the busiest gate (A1, counted). */
  departuresByTerminal: Record<string, number | null>;
  topGateByTerminal: Record<string, AirportBriefGate | null>;
  /** Only a TODAY service day has a "next" band; past and future days do not. */
  dayRelation: "PAST" | "TODAY" | "FUTURE";
  nowIso: string;
}

export interface TerminalBriefing {
  terminal: string;
  /** Longest current wait in this terminal (observed), or null. */
  checkpoint: AirportBriefCheckpoint | null;
  checkpointBasis: "WAIT_TIME" | "WAITING_COUNT" | null;
  /** The official band that contains or follows `nowIso` today (forecast). */
  nextBand: TerminalForecastBand | null;
  /** Today's official peak band; only when the day's bands are COMPLETE. */
  peak: AirportBriefPeak | null;
  coverage: BriefCoverage;
  remaining: TerminalRemaining | null;
  departures: number | null;
  topGate: AirportBriefGate | null;
  evidenceTypes: Array<"CHECKPOINT" | "NEXT_BAND" | "PEAK" | "FLIGHTS">;
}

export interface TerminalAttention {
  terminal: string;
  /** Which official fact decided it. Observed queue beats forecast; forecast is used only when no terminal has a comparable wait. */
  basis: "OBSERVED_WAIT" | "FORECAST_NEXT_BAND";
}

export interface TerminalBriefingSet {
  terminals: TerminalBriefing[];
  attention: TerminalAttention | null;
}

function comparableWait(row: AirportBriefCheckpoint): number | null {
  if (typeof row.waitTimeMinutes === "number" && Number.isFinite(row.waitTimeMinutes)) return row.waitTimeMinutes;
  const match = row.waitTimeRaw?.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function longestCheckpoint(rows: AirportBriefCheckpoint[]): { row: AirportBriefCheckpoint; basis: "WAIT_TIME" | "WAITING_COUNT" } | null {
  if (!rows.length) return null;
  const withWait = rows.filter((row) => comparableWait(row) !== null);
  const basis = withWait.length ? "WAIT_TIME" : "WAITING_COUNT";
  const candidates = withWait.length ? withWait : rows;
  const row = [...candidates].sort((a, b) => {
    if (basis === "WAIT_TIME") {
      const waitDiff = (comparableWait(b) ?? -1) - (comparableWait(a) ?? -1);
      if (waitDiff) return waitDiff;
    }
    const countDiff = (b.waitingCount ?? -1) - (a.waitingCount ?? -1);
    if (countDiff) return countDiff;
    return a.zone.localeCompare(b.zone);
  })[0];
  return { row, basis };
}

function isValidBand(band: TerminalForecastBand): boolean {
  return Number.isFinite(Date.parse(band.targetStartAt))
    && Number.isFinite(Date.parse(band.targetEndAt))
    && Number.isFinite(band.expectedPassengers)
    && band.expectedPassengers >= 0;
}

/** The band whose window contains `now`, else the first band starting after it. Today only. */
export function selectNextBand(timeline: TerminalForecastBand[], nowIso: string, dayRelation: TerminalBriefingInput["dayRelation"]): TerminalForecastBand | null {
  if (dayRelation !== "TODAY") return null;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;
  const bands = timeline.filter(isValidBand).sort((a, b) => Date.parse(a.targetStartAt) - Date.parse(b.targetStartAt));
  const containing = bands.find((band) => Date.parse(band.targetStartAt) <= now && now < Date.parse(band.targetEndAt));
  if (containing) return containing;
  return bands.find((band) => Date.parse(band.targetStartAt) > now) ?? null;
}

export function buildTerminalBriefings(input: TerminalBriefingInput): TerminalBriefingSet {
  const terminals = input.terminals.map((terminal) => {
    const selected = longestCheckpoint(input.congestion.filter((row) => row.terminal === terminal));
    const coverage = input.coverageByTerminal[terminal] ?? "UNAVAILABLE";
    const peak = coverage === "COMPLETE" ? input.peakByTerminal[terminal] ?? null : null;
    const nextBand = selectNextBand(input.timelineByTerminal[terminal] ?? [], input.nowIso, input.dayRelation);
    const remaining = coverage === "COMPLETE" ? input.remainingByTerminal[terminal] ?? null : null;
    const departures = input.departuresByTerminal[terminal] ?? null;
    const topGate = input.topGateByTerminal[terminal] ?? null;
    const evidenceTypes: TerminalBriefing["evidenceTypes"] = [];
    if (selected) evidenceTypes.push("CHECKPOINT");
    if (nextBand) evidenceTypes.push("NEXT_BAND");
    if (peak) evidenceTypes.push("PEAK");
    if (departures !== null || topGate) evidenceTypes.push("FLIGHTS");
    return {
      terminal,
      checkpoint: selected?.row ?? null,
      checkpointBasis: selected?.basis ?? null,
      nextBand,
      peak,
      coverage,
      remaining,
      departures,
      topGate,
      evidenceTypes,
    } satisfies TerminalBriefing;
  });

  // Attention: the terminal with the longest comparable observed wait. Only
  // when no terminal has a usable wait does the larger official next band
  // decide, and the basis says which one it was. Ties resolve to no pick
  // rather than an arbitrary terminal.
  let attention: TerminalAttention | null = null;
  const byWait = terminals
    .map((row) => ({ terminal: row.terminal, wait: row.checkpoint ? comparableWait(row.checkpoint) : null }))
    .filter((row): row is { terminal: string; wait: number } => row.wait !== null)
    .sort((a, b) => b.wait - a.wait);
  if (byWait.length && (byWait.length === 1 || byWait[0].wait > byWait[1].wait)) {
    attention = { terminal: byWait[0].terminal, basis: "OBSERVED_WAIT" };
  } else if (!byWait.length) {
    const byBand = terminals
      .map((row) => ({ terminal: row.terminal, expected: row.nextBand?.expectedPassengers ?? null }))
      .filter((row): row is { terminal: string; expected: number } => row.expected !== null)
      .sort((a, b) => b.expected - a.expected);
    if (byBand.length && (byBand.length === 1 || byBand[0].expected > byBand[1].expected)) {
      attention = { terminal: byBand[0].terminal, basis: "FORECAST_NEXT_BAND" };
    }
  }

  return { terminals, attention };
}
