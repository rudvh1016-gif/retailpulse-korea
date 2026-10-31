/** Pure physical-flight definitions shared by full profiles and the lazy today UI.
 * No side/destination evidence tables belong in this dependency boundary.
 */
import { flightBoardingLocation } from "./flight-scope";
export type BoardingArea = "T1" | "T2" | "CONCOURSE" | "UNKNOWN";
export interface SideFlightRow {
  physicalFlightId?: unknown;
  terminal?: unknown;
  gate?: unknown;
  scheduledAt?: unknown;
  status?: unknown;
  retrievedAt?: unknown;
}

/** The boarding building a flight uses, from its stored terminal or an exact concourse gate. */
export function boardingAreaOf(row: { terminal?: unknown; gate?: unknown }): BoardingArea {
  const location = flightBoardingLocation(row);
  return location === "T1" || location === "T2" || location === "CONCOURSE" ? location : "UNKNOWN";
}


/** Keep the first row on equal retrieval timestamps, exactly as stored profiles do. */
export function latestDayFlights<T extends SideFlightRow>(rows: readonly T[], day: string): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const id = String(row.physicalFlightId ?? "");
    if (!id || String(row.scheduledAt ?? "").slice(0, 10) !== day) continue;
    const current = latest.get(id);
    if (!current || String(row.retrievedAt ?? "") > String(current.retrievedAt ?? "")) latest.set(id, row);
  }
  return latest;
}
export const cancelledFlight = (row: SideFlightRow): boolean => String(row.status ?? "") === "cancelled";
export const scheduledFlightHour = (row: SideFlightRow): number => Number(String(row.scheduledAt).slice(11, 13));
export interface FlightHours { total: number; hours: number[] }
/** T1's comparison scope includes the concourse; T2 does not. */
export function terminalFlightHours(profile: Record<"T1" | "T2" | "CONCOURSE", FlightHours>, terminal: "T1" | "T2"): FlightHours {
  const a = profile[terminal], b = terminal === "T1" ? profile.CONCOURSE : null;
  return {total: a.total + (b?.total ?? 0), hours: b ? a.hours.map((value, hour) => value + (b.hours[hour] ?? 0)) : [...a.hours]};
}
export function dailyFlightHours(rows: readonly SideFlightRow[], day: string) {
  const empty = (): FlightHours => ({total: 0, hours: Array.from({length: 24}, () => 0)});
  const byArea = {T1: empty(), T2: empty(), CONCOURSE: empty(), UNKNOWN: empty()};
  const seenHours = new Set<number>();
  let cancelled = 0;
  for (const row of latestDayFlights(rows, day).values()) {
    if (cancelledFlight(row)) { cancelled++; continue; }
    const counts = byArea[boardingAreaOf(row)];
    counts.total++;
    const hour = scheduledFlightHour(row);
    seenHours.add(hour);
    counts.hours[hour] = (counts.hours[hour] ?? 0) + 1;
  }
  // Preserve the stored profile shape even for malformed/out-of-range hours.
  for (const hour of seenHours) for (const counts of Object.values(byArea)) counts.hours[hour] ??= 0;
  return {...byArea, unknownBuilding: byArea.UNKNOWN.total, cancelled};
}
