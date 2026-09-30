/**
 * East/west departure flights of one terminal, side by side, and a rough
 * passenger figure derived from them.
 *
 * This is NOT the departure-hall east/west sum (that one adds hall figures
 * and stays withheld behind NEXT_PUBLIC_AIRPORT_HALL_SIDES). Here people are
 * never assigned to a side by hall number. The only person figure used is the
 * terminal-wide expected departures the airport already publishes (A5), split
 * by the east:west ratio of flights whose gate side is evidenced:
 *
 *   east share = east / (east + west)      centre and unverified flights are
 *   west share = west / (east + west)      outside the denominator
 *   estimate   = terminal expected departures x share
 *
 * The estimate is a reference value, never an actual count. The flight rows
 * carry no aircraft type or seat field (airport_flights columns), so flights
 * are weighted equally; no seat count, load factor or per-flight passenger
 * figure is invented.
 */
import type { GateSideDay } from "./airport-sides";
import type { AirportSidesBlock } from "./airport-sides-summary";

const HOUR_MS = 3_600_000;
/** Same publication window as the rest of the airport figures (A5, A1). */
export const SPLIT_FRESH_MS = 30 * HOUR_MS;

export type SplitTerminal = "T1" | "T2";

export interface SplitHour {
  hour: number;
  total: number;
  east: number;
  west: number;
  center: number;
  unverified: number;
  eastPct: number | null;
  westPct: number | null;
}

export interface FlightSplit {
  terminal: SplitTerminal;
  total: number;
  east: number;
  west: number;
  center: number;
  unverified: number;
  /** East + west: the flights the shares are computed from. */
  verified: number;
  /** Whole percents that add up to 100; null when no flight has an east or west gate. */
  eastPct: number | null;
  westPct: number | null;
  /** Unverified flights as a share of ALL the terminal's flights, one decimal. */
  unverifiedPct: number | null;
  larger: "EAST" | "WEST" | "EQUAL" | null;
  hours: SplitHour[];
  /** When the newest flight row last changed (shown to the reader). */
  retrievedAt: string | null;
  /**
   * When the flight source was last collected successfully. Rows are written
   * changed-only, so a row's own stamp stops moving on a quiet day; freshness
   * is judged on this stamp when the summary carries one.
   */
  checkedAt: string | null;
  basis: NonNullable<AirportSidesBlock["gateBasis"]>;
  /** Terminal-wide expected departures x flight share; east + west equals the terminal total exactly. */
  expected: { total: number; east: number; west: number } | null;
  /** When the airport's expected-departures rows last changed (shown beside the estimate). */
  expectedIssuedAt: string | null;
}

export type SplitResult =
  | { status: "OK"; split: FlightSplit }
  | { status: "NONE" | "STALE" | "DATE_MISMATCH" | "NO_TERMINAL_FLIGHTS" };

/** Two whole percents that add up to 100. */
export function sharePercents(east: number, west: number): { eastPct: number; westPct: number } | null {
  const sum = east + west;
  if (!(sum > 0)) return null;
  const eastPct = Math.round((east * 100) / sum);
  return { eastPct, westPct: 100 - eastPct };
}

/**
 * Splits a whole number by the east:west ratio so the two parts add up to it
 * exactly (rounding never leaves a person over or short).
 */
export function splitByRatio(total: number, east: number, west: number): { east: number; west: number } | null {
  const sum = east + west;
  if (!(sum > 0) || !Number.isFinite(total) || total < 0) return null;
  const eastPart = Math.round((total * east) / sum);
  return { east: eastPart, west: total - eastPart };
}

const oneDecimal = (part: number, whole: number) => (whole > 0 ? Math.round((part * 1000) / whole) / 10 : null);

export function flightSplitOf(
  day: GateSideDay,
  terminal: SplitTerminal,
  basis: FlightSplit["basis"],
  expectedTotal: number | null,
  checkedAt: string | null = day.retrievedAt,
  expectedIssuedAt: string | null = null,
): FlightSplit | null {
  const counts = day.byArea[terminal];
  if (!counts.total) return null;
  const shares = sharePercents(counts.EAST, counts.WEST);
  const parts = expectedTotal !== null ? splitByRatio(expectedTotal, counts.EAST, counts.WEST) : null;
  return {
    terminal,
    total: counts.total,
    east: counts.EAST,
    west: counts.WEST,
    center: counts.CENTER,
    unverified: counts.UNVERIFIED,
    verified: counts.EAST + counts.WEST,
    eastPct: shares?.eastPct ?? null,
    westPct: shares?.westPct ?? null,
    unverifiedPct: oneDecimal(counts.UNVERIFIED, counts.total),
    // Judged on the percentages the reader sees: 50% and 50% is never "more on the west".
    larger: shares === null ? null : shares.eastPct > shares.westPct ? "EAST" : shares.westPct > shares.eastPct ? "WEST" : "EQUAL",
    hours: day.byHour.map((row) => {
      const hour = row.byArea[terminal];
      const hourShares = sharePercents(hour.EAST, hour.WEST);
      return { hour: row.hour, total: hour.total, east: hour.EAST, west: hour.WEST, center: hour.CENTER, unverified: hour.UNVERIFIED,
        eastPct: hourShares?.eastPct ?? null, westPct: hourShares?.westPct ?? null };
    }).filter((row) => row.total > 0),
    retrievedAt: day.retrievedAt,
    checkedAt,
    basis,
    expected: parts && expectedTotal !== null ? { total: expectedTotal, east: parts.east, west: parts.west } : null,
    expectedIssuedAt,
  };
}

interface SummaryLike {
  serviceDateKst: string;
  dayRelation: string;
  airport?: {
    serviceDateKst?: string | null;
    passengerForecastTimelineByTerminal?: Record<string, ReadonlyArray<{ expectedPassengers: number }>>;
    forecastCoverage?: { byTerminal?: Record<string, string> };
    passengerForecastRetrievedAtByTerminal?: Record<string, string | null>;
  };
  /** Source health: when each source last collected successfully. */
  sources?: ReadonlyArray<{ sourceId: string; retrievedAt: string | null }>;
}

/** The source-level collection time when the summary has one, else the rows' own stamp. */
export function collectionStamp(summary: Pick<SummaryLike, "sources">, sourceId: string, rowStamp: string | null): string | null {
  const stamp = summary.sources?.find((source) => source.sourceId === sourceId)?.retrievedAt;
  return stamp ? stamp : rowStamp;
}

const stale = (retrievedAt: string | null, nowMs: number, dayRelation: string) =>
  dayRelation !== "PAST" && retrievedAt !== null && nowMs - Date.parse(retrievedAt) > SPLIT_FRESH_MS;

/**
 * The one place the split is worked out from a live summary: the screen card,
 * the prep facts, the copied text and the image all read this result.
 */
export function splitFromSummary(summary: SummaryLike, sides: AirportSidesBlock | null | undefined, terminal: SplitTerminal, nowIso: string): SplitResult {
  const gates = sides?.gates;
  if (!gates || !sides?.gateBasis) return { status: "NONE" };
  if (gates.date !== summary.serviceDateKst) return { status: "DATE_MISMATCH" };
  const now = Date.parse(nowIso);
  const flightsCheckedAt = collectionStamp(summary, "INCHEON_FLIGHT_DETAIL", gates.retrievedAt);
  if (stale(flightsCheckedAt, now, summary.dayRelation)) return { status: "STALE" };
  // The terminal-wide expected departures count only when the airport's own
  // day is complete, is for this date and is not older than its window.
  const airport = summary.airport;
  const sameDay = airport?.serviceDateKst === summary.serviceDateKst;
  const bands = sameDay ? airport?.passengerForecastTimelineByTerminal?.[terminal] ?? [] : [];
  const complete = sameDay && airport?.forecastCoverage?.byTerminal?.[terminal] === "COMPLETE" && bands.length > 0;
  const retrieved = sameDay ? collectionStamp(summary, "INCHEON_PASSENGER_FORECAST", airport?.passengerForecastRetrievedAtByTerminal?.[terminal] ?? null) : null;
  const sum = complete && !stale(retrieved, now, summary.dayRelation) ? bands.reduce((total, band) => total + band.expectedPassengers, 0) : null;
  const split = flightSplitOf(gates, terminal, sides.gateBasis, sum !== null && Number.isFinite(sum) ? sum : null, flightsCheckedAt,
    sameDay ? airport?.passengerForecastRetrievedAtByTerminal?.[terminal] ?? retrieved : null);
  return split ? { status: "OK", split } : { status: "NO_TERMINAL_FLIGHTS" };
}
