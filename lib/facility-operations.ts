/**
 * Airport Retail A4 — the operations brief for one selected facility.
 *
 * Pure and deterministic: same inputs, same output, no provider call, no
 * runtime LLM, no stored state. Everything it reports is an official value
 * that keeps its own kind, and every kind is labelled, because the whole
 * risk here is a reader collapsing four different things into "how busy will
 * my shop be".
 *
 * The four things that are never equated:
 *   a checkpoint queue is not store visitors
 *   a flight count is not a passenger count
 *   a terminal passenger forecast is not a store passenger forecast
 *   a gate number is not physical proximity
 *
 * So this module produces no sales prediction, no visitor forecast, no
 * conversion estimate and no 0-100 score. It reports counts and official
 * forecasts, states which terminal they belong to, and says plainly when the
 * evidence is not enough.
 */
import type { AirportZoneMapping } from "./airport-zone-map";

/** A physical departure the A1 rows already carry. */
export interface FacilityFlight {
  scheduledAt: string;
  terminal: string | null;
  gate: string | null;
}

export interface FacilityForecastBand {
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
}

export interface FacilityCheckpointObservation {
  terminal: string;
  zone: string;
  waitTimeMinutes: number | null;
  waitTimeRaw?: string | null;
  waitingCount: number | null;
  observedAt: string;
  freshness?: "LIVE" | "STALE";
}

export interface FacilityOperationsInput {
  mapping: AirportZoneMapping;
  nowIso: string;
  /** Physical departures for the facility's terminal today (A1, counted). */
  flights: readonly FacilityFlight[];
  /** Official expected-passenger bands for the facility's terminal (A5, forecast). */
  forecastBands: readonly FacilityForecastBand[];
  /** Current departure-hall observations (A4, observed). */
  checkpoints: readonly FacilityCheckpointObservation[];
  /** When each contributing source was last retrieved, for the freshness line. */
  sourceRetrievedAt: Readonly<Record<string, string | null>>;
}

/** How many departures fall inside each look-ahead window. */
export interface FacilityFlightWindow {
  minutes: 30 | 60 | 120;
  flights: number;
}

/**
 * A KORETAIL reading of official signals, never a measurement of the store.
 * Every value is one of a fixed set of deterministic states; there is no
 * numeric score behind it.
 */
export type OperatingReference =
  | "INFLOW_WAITING"
  | "FLOW_RISING"
  | "CONCENTRATED_NOW"
  | "FAST_PURCHASE_WATCH"
  | "STABLE"
  | "INSUFFICIENT_EVIDENCE";

export interface FacilityOperationsBrief {
  facilityId: string;
  terminal: string | null;
  mappingMethod: AirportZoneMapping["mappingMethod"];
  /** Only ever non-null for a proven mapping. */
  gate: string | null;
  gateGroup: string | null;
  checkpointId: string | null;
  windows: FacilityFlightWindow[];
  /** The official band containing or following now, for this terminal only. */
  nextBand: FacilityForecastBand | null;
  /** The largest official band still ahead today, for this terminal only. */
  nextPeak: FacilityForecastBand | null;
  /**
   * The checkpoint observation this facility is actually entitled to.
   *
   * Only when the mapping proved a checkpoint AND a stored observation
   * carries that exact zone. A terminal match is not enough: it would turn a
   * terminal-wide queue into "your checkpoint", which is the store-specific
   * claim this module refuses to make.
   */
  checkpoint: FacilityCheckpointObservation | null;
  operatingReference: OperatingReference;
  /** Which official evidence types actually contributed. */
  evidence: Array<"FLIGHTS" | "PASSENGER_FORECAST" | "CHECKPOINT" | "ZONE_MAPPING">;
  /** What is missing, named rather than silently absent. */
  missingEvidence: Array<"FLIGHTS" | "PASSENGER_FORECAST" | "CHECKPOINT" | "ZONE_MAPPING">;
  sourceRetrievedAt: Record<string, string | null>;
  generatedAt: string;
}

const WINDOW_MINUTES = [30, 60, 120] as const;

function countFlightsWithin(flights: readonly FacilityFlight[], now: number, minutes: number): number {
  const until = now + minutes * 60_000;
  let count = 0;
  for (const flight of flights) {
    const at = Date.parse(flight.scheduledAt);
    if (Number.isFinite(at) && at >= now && at <= until) count += 1;
  }
  return count;
}

/**
 * Counts departures for the facility's own terminal only.
 *
 * A T1 shop is told about T1 departures. Counting the whole airport would be
 * the "terminal information pretending to be store information" mistake in
 * its most direct form.
 */
export function flightsForTerminal(flights: readonly FacilityFlight[], terminal: string | null): FacilityFlight[] {
  if (!terminal) return [];
  return flights.filter((flight) => flight.terminal === terminal);
}

/**
 * The deterministic operating reference.
 *
 * Plain thresholds over official counts, evaluated in a fixed order. It reads
 * official passenger, flight and departure-hall data; it does not mean store
 * visitors or sales, and the UI must say so beside it.
 */
export function deriveOperatingReference(input: {
  windows: readonly FacilityFlightWindow[];
  nextBand: FacilityForecastBand | null;
  checkpoint: FacilityCheckpointObservation | null;
  hasFlights: boolean;
  hasForecast: boolean;
}): OperatingReference {
  const within30 = input.windows.find((window) => window.minutes === 30)?.flights ?? 0;
  const within60 = input.windows.find((window) => window.minutes === 60)?.flights ?? 0;
  const within120 = input.windows.find((window) => window.minutes === 120)?.flights ?? 0;

  // Nothing official to read is its own answer, and it is stated, not hidden.
  if (!input.hasFlights && !input.hasForecast && !input.checkpoint) return "INSUFFICIENT_EVIDENCE";

  // An observed queue is the only signal that is happening right now, so it
  // leads. A long wait means passengers are still held before the airside
  // shops, which is a different situation from a busy airside hour.
  const waitMinutes = input.checkpoint?.waitTimeMinutes;
  const boundedWait = typeof input.checkpoint?.waitTimeRaw === "string" && /^\d+\+$/.test(input.checkpoint.waitTimeRaw);
  if (boundedWait || (typeof waitMinutes === "number" && waitMinutes >= 30)) return "INFLOW_WAITING";

  if (within30 >= 8) return "CONCENTRATED_NOW";
  // Rising: the hour ahead carries clearly more than the half-hour in hand.
  if (within60 >= 10 && within60 >= within30 * 2) return "FLOW_RISING";
  if (within30 >= 4) return "FAST_PURCHASE_WATCH";
  if (input.hasFlights || input.hasForecast) {
    // A quiet half-hour with a busy two hours is still worth naming as rising.
    if (within120 >= 12 && within30 <= 1) return "FLOW_RISING";
    return "STABLE";
  }
  return "INSUFFICIENT_EVIDENCE";
}

export function buildFacilityOperationsBrief(input: FacilityOperationsInput): FacilityOperationsBrief {
  const now = Date.parse(input.nowIso);
  if (!Number.isFinite(now)) throw new Error("facility_operations_invalid_now");
  const terminal = input.mapping.terminal;
  const proven = input.mapping.mappingMethod !== "AMBIGUOUS";

  const terminalFlights = flightsForTerminal(input.flights, terminal);
  const windows = WINDOW_MINUTES.map((minutes) => ({
    minutes,
    flights: countFlightsWithin(terminalFlights, now, minutes),
  }));

  // A band that ends exactly now is over, not "next": `>=` here would report a
  // finished hour as the hour ahead.
  const ahead = input.forecastBands
    .filter((band) => Date.parse(band.targetEndAt) > now)
    .sort((left, right) => Date.parse(left.targetStartAt) - Date.parse(right.targetStartAt));
  const nextBand = ahead[0] ?? null;
  const nextPeak = ahead.length
    ? ahead.reduce((best, band) => (band.expectedPassengers > best.expectedPassengers ? band : best))
    : null;

  // A checkpoint is attached only when the mapping proved one and a stored
  // observation carries that exact zone. Matching on terminal alone would
  // relabel a terminal-wide queue as this store's checkpoint.
  const checkpoint = proven && input.mapping.checkpointId && terminal
    ? input.checkpoints.find((row) => row.terminal === terminal && row.zone === input.mapping.checkpointId) ?? null
    : null;

  const hasFlights = terminalFlights.length > 0;
  const hasForecast = ahead.length > 0;
  const evidence: FacilityOperationsBrief["evidence"] = [];
  const missingEvidence: FacilityOperationsBrief["missingEvidence"] = [];
  (hasFlights ? evidence : missingEvidence).push("FLIGHTS");
  (hasForecast ? evidence : missingEvidence).push("PASSENGER_FORECAST");
  (checkpoint ? evidence : missingEvidence).push("CHECKPOINT");
  (proven ? evidence : missingEvidence).push("ZONE_MAPPING");

  return {
    facilityId: input.mapping.facilityId,
    terminal,
    mappingMethod: input.mapping.mappingMethod,
    // An ambiguous facility carries no gate anywhere in the brief, so no
    // downstream surface can render a proximity it was never given.
    gate: proven ? input.mapping.gate : null,
    gateGroup: proven ? input.mapping.gateGroup : null,
    checkpointId: proven ? input.mapping.checkpointId : null,
    windows,
    nextBand,
    nextPeak,
    checkpoint,
    operatingReference: deriveOperatingReference({ windows, nextBand, checkpoint, hasFlights, hasForecast }),
    evidence,
    missingEvidence,
    sourceRetrievedAt: { ...input.sourceRetrievedAt },
    generatedAt: input.nowIso,
  };
}
