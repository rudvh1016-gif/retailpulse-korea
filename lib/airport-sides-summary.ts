/**
 * The `airport.sides` block of `/api/live/summary`: east/west departure halls
 * (A5, expected passengers) and gate sides (A1, physical flights), built from
 * rows the summary already reads.
 *
 * Hall sides are an A5 "예상 혼잡도" style figure. data.go.kr 15095066 asks a
 * public service built on it to agree its user notice wording with the
 * airport's managing department, and no such agreement is on record for a
 * per-side figure. Until the owner records one and turns
 * NEXT_PUBLIC_AIRPORT_HALL_SIDES on, the halls are left out of the public
 * response entirely (not merely hidden in the page). Gate-side flight counts
 * carry no such condition.
 */
import { AIRPORT_SIDES_VERSION, summarizeGateSides, summarizeHallSides, type GateSideDay, type HallForecastRow, type HallSideDay, type SideFlightRow } from "./airport-sides";

export const AIRPORT_HALL_SIDES_PUBLIC = process.env.NEXT_PUBLIC_AIRPORT_HALL_SIDES === "true";

export interface AirportSidesBlock {
  version: string;
  /** null while the hall-side notice condition is unmet (see above). */
  halls: { T1: HallSideDay; T2: HallSideDay } | null;
  hallsWithheld: boolean;
  gates: GateSideDay | null;
  gateBasis: "COLLECTED_FLIGHT_RECORDS" | "OFFICIAL_DEPARTURE_SCHEDULE" | null;
  /** Why gates are null: nothing collected for the date, or the read hit its cap (not a whole day). */
  gatesUnavailable: "NO_RECORDS" | "CAPPED" | null;
}

interface ScheduleRow { physicalFlightId: string; terminal: string | null; gate?: string | null; scheduledTime: string; status?: string }

export function airportSides(
  date: string,
  dayRelation: string,
  hallRows: ReadonlyArray<Record<string, unknown>>,
  flightRows: ReadonlyArray<Record<string, unknown>>,
  schedule: ReadonlyArray<ScheduleRow>,
  hasSchedule: boolean,
  hallsPublic = AIRPORT_HALL_SIDES_PUBLIC,
  scheduleRetrievedAt: string | null = null,
): AirportSidesBlock {
  const halls = hallsPublic ? {
    T1: summarizeHallSides(hallRows as unknown as HallForecastRow[], "T1", date),
    T2: summarizeHallSides(hallRows as unknown as HallForecastRow[], "T2", date),
  } : null;
  let rows: SideFlightRow[] = [];
  let gateBasis: AirportSidesBlock["gateBasis"] = null;
  let gatesUnavailable: AirportSidesBlock["gatesUnavailable"] = null;
  // Today before the day's first collection has no recorded flights yet, but the
  // airport's own schedule for the day is already held (it is replaced by the
  // records at the first scan). That is a labelled schedule, not an empty day.
  if (dayRelation === "FUTURE" || (dayRelation === "TODAY" && flightRows.length === 0)) {
    if (hasSchedule) {
      gateBasis = "OFFICIAL_DEPARTURE_SCHEDULE";
      rows = schedule.map((row) => ({ physicalFlightId: row.physicalFlightId, terminal: row.terminal, gate: row.gate ?? null,
        scheduledAt: `${date}T${row.scheduledTime}:00+09:00`, status: row.status ?? "unknown", retrievedAt: scheduleRetrievedAt }));
    }
  } else if (flightRows.length >= 2000) {
    gatesUnavailable = "CAPPED";
  } else {
    gateBasis = "COLLECTED_FLIGHT_RECORDS";
    rows = [...flightRows] as SideFlightRow[];
  }
  const gates = rows.length ? summarizeGateSides(rows, date) : null;
  if (!gates && !gatesUnavailable) gatesUnavailable = "NO_RECORDS";
  return { version: AIRPORT_SIDES_VERSION, halls, hallsWithheld: !hallsPublic, gates, gateBasis: gates ? gateBasis : null, gatesUnavailable };
}
