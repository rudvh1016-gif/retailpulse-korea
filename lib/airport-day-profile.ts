/**
 * One day's departures in a compact form that can be compared with other
 * days: per terminal, the physical departures, their scheduled hours, their
 * evidenced gate sides and their destinations.
 *
 * The same function builds the stored history (lib/airport-composition-history.ts,
 * run by the existing airport collector) and the current day (the airport-days
 * read route), so a comparison never mixes two definitions. Codeshares count
 * once (newest row), cancelled flights are left out and counted apart, and
 * sides come from summarizeGateSides with the gate table of `sidesVersion`.
 *
 * `complete` is true only when a successful scan of the airport feed covering
 * the day ran after the day had ended; a day still in progress is never
 * compared as if it were a whole past day.
 */
import { AIRPORT_SIDES_VERSION, boardingAreaOf, summarizeGateSides, type SideFlightRow } from "./airport-sides";
import { dailyFlightHours, latestDayFlights, cancelledFlight } from "./airport-flight-hours";
import { normalizeDestination } from "./airport-destinations";

export const PROFILE_VERSION = 1;

export interface ProfileRow extends SideFlightRow {
  airportCode?: unknown;
}

export interface TerminalProfile {
  total: number;
  /** Departures by scheduled KST hour, 0..23. */
  hours: number[];
  /** Evidenced gate sides, east / west / centre / unconfirmed. */
  sides: [number, number, number, number];
  /** Stored destination name (normalised) -> departures. */
  destinations: Record<string, number>;
}

export interface DayProfile {
  v: typeof PROFILE_VERSION;
  day: string;
  sidesVersion: string;
  complete: boolean;
  T1: TerminalProfile;
  T2: TerminalProfile;
  CONCOURSE: TerminalProfile;
  unknownBuilding: number;
  cancelled: number;
}

const empty = (): TerminalProfile => ({ total: 0, hours: Array.from({ length: 24 }, () => 0), sides: [0, 0, 0, 0], destinations: {} });

export function dailyFlightProfile(rows: readonly ProfileRow[], day: string, complete: boolean): DayProfile {
  const sides = summarizeGateSides(rows, day);
  const countsByArea = dailyFlightHours(rows, day);
  const profile: DayProfile = {
    v: PROFILE_VERSION, day, sidesVersion: AIRPORT_SIDES_VERSION, complete,
    T1: empty(), T2: empty(), CONCOURSE: empty(), unknownBuilding: countsByArea.unknownBuilding, cancelled: countsByArea.cancelled,
  };
  for (const area of ["T1", "T2", "CONCOURSE"] as const) {
    const counts = sides.byArea[area];
    profile[area].total = countsByArea[area].total;
    profile[area].sides = [counts.EAST, counts.WEST, counts.CENTER, counts.UNVERIFIED];
    profile[area].hours = countsByArea[area].hours;
  }
  // Destinations of the same physical flights summarizeGateSides counted.
  const latest = latestDayFlights(rows, day);
  for (const row of latest.values()) {
    if (cancelledFlight(row)) continue;
    const area = boardingAreaOf(row);
    if (area === "UNKNOWN") continue;
    const raw = row.airportCode === null || row.airportCode === undefined ? "" : String(row.airportCode).trim();
    const key = raw ? normalizeDestination(raw) : "";
    profile[area].destinations[key] = (profile[area].destinations[key] ?? 0) + 1;
  }
  return profile;
}

/** A stored payload's profile, or null when it has none or another version. */
export function profileOf(payload: unknown): DayProfile | null {
  const value = (payload as { profile?: DayProfile } | null)?.profile;
  return value && value.v === PROFILE_VERSION && typeof value.day === "string" ? value : null;
}
