/**
 * The airport departure map: one terminal's departures in a chosen time
 * window, placed at their gates on KORETAIL's own schematic, with the same
 * east/west counts as the comparison card and a destination breakdown.
 *
 * One calculation serves the map, the side counts, the destination table, the
 * flight list and the copied text, so a flight can never be counted in one and
 * missed in another:
 *
 * - rows are the ones the flights API returns for the date (collected records,
 *   or the official departure schedule for a future date);
 * - codeshares collapse to one physical flight, the newest retrieval deciding
 *   terminal and gate, and cancelled flights are counted apart
 *   (summarizeGateSides, exactly as the card does);
 * - the window keeps a flight when its scheduled time t satisfies
 *   start <= t < end, to the minute;
 * - T1 means the T1 main building plus the concourse (drawn as its own
 *   building); T2 means T2. A flight whose building is unknown belongs to
 *   neither and is only counted.
 *
 * A dot is drawn only for a gate whose position the official map gives
 * (config/airport-gate-positions.v1.json). A flight with no gate, or with a
 * gate that has no known position, is listed apart and never drawn at a
 * guessed place. Flights are aircraft departures: a busy gate is not a busy
 * shop, and nothing here counts people.
 */
import positions from "../config/airport-gate-positions.v1.json" with { type: "json" };
import { boardingAreaOf, gateSideOf, summarizeGateSides, type BoardingArea, type GateSide, type SideCounts, type SideFlightRow } from "./airport-sides";
import { destinationOf, type DestinationGroup, type DestinationEntry, DESTINATION_GROUPS } from "./airport-destinations";

export type MapTerminal = "T1" | "T2";
export type MapBuilding = "T1" | "T2" | "CONCOURSE";

export interface MapFlightRow extends SideFlightRow {
  flightNumber?: unknown;
  airlineCode?: unknown;
  airportCode?: unknown;
  direction?: unknown;
}

export interface MapWindow {
  /** Minutes after 00:00 KST of the service date. */
  startMin: number;
  /** Exclusive. Up to 2,880: past 1,440 means the next day's first hours. */
  endMin: number;
}

export interface MapFlight {
  id: string;
  flightNumber: string;
  airline: string | null;
  destinationCode: string | null;
  destination: DestinationEntry | null;
  group: DestinationGroup;
  scheduledAt: string;
  building: BoardingArea;
  gate: string | null;
  side: GateSide;
  status: string;
  /** Gate position on the schematic, or null when the official map gives none. */
  position: { x: number; y: number } | null;
  /** The day the row came from: the service date, or the next day for a window past midnight. */
  day: "SERVICE_DATE" | "NEXT_DAY";
}

export interface MapGate {
  building: MapBuilding;
  gate: string;
  x: number;
  y: number;
  side: GateSide;
  flights: number;
}

export interface GroupRow {
  group: DestinationGroup;
  flights: number;
  /** Of the main building's flights: by evidenced side. */
  bySide: Record<GateSide, number>;
  /** T1 only: concourse flights to this group. */
  concourse: number;
}

export interface DepartureMap {
  terminal: MapTerminal;
  window: MapWindow;
  /** The part of the window after midnight: covered by the next day's rows, missing, or not asked. */
  nextDay: "NOT_NEEDED" | "COVERED" | "MISSING";
  flights: MapFlight[];
  /** The main building's side counts in the window, identical in definition to the comparison card. */
  sides: SideCounts;
  /** T1 only: concourse flights in the window (the card counts T1 main building only). */
  concourse: number | null;
  /** Flights whose building is unknown: in neither terminal, counted apart. */
  unknownBuilding: number;
  cancelled: number;
  /** Positioned gates of the terminal's buildings, each with its flights in the window (0 included, for drawing). */
  gates: MapGate[];
  /** Flights that cannot be drawn: no gate yet, or a gate with no official position. */
  unplaced: { noGate: MapFlight[]; notOnMap: MapFlight[] };
  /** Destination breakdown of every flight in the window (main building + concourse); groups do not overlap. */
  groups: GroupRow[];
  /** Flights whose destination is not in the table. */
  unknownDestination: number;
}

type Positions = Record<MapBuilding, { gates: Record<string, { x: number; y: number }> }>;
const POSITIONS = positions.buildings as unknown as Positions;

export const MAP_POSITIONS_VERSION = positions.version;

export function positionOf(building: BoardingArea, gate: unknown): { x: number; y: number } | null {
  if (building === "UNKNOWN") return null;
  const key = String(gate ?? "").trim();
  const point = POSITIONS[building]?.gates[key];
  return point ? { x: point.x, y: point.y } : null;
}

export function buildingsOf(terminal: MapTerminal): MapBuilding[] {
  return terminal === "T1" ? ["T1", "CONCOURSE"] : ["T2"];
}

const KST_OFFSET = "+09:00";
const pad = (value: number) => String(value).padStart(2, "0");

/** Minutes after 00:00 KST of `date` for a stored KST timestamp, or null. */
export function minuteOfDay(date: string, scheduledAt: unknown): number | null {
  const text = String(scheduledAt ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(text);
  if (!match) return null;
  const at = Date.parse(text), base = Date.parse(`${date}T00:00:00${KST_OFFSET}`);
  if (!Number.isFinite(at) || !Number.isFinite(base)) return null;
  return Math.floor((at - base) / 60_000);
}

export function windowLabel(window: MapWindow): string {
  const clock = (minute: number) => `${pad(Math.floor((minute % 1440) / 60))}:${pad(minute % 60)}`;
  return `${clock(window.startMin)}–${window.endMin === 1440 ? "24:00" : clock(window.endMin)}${window.endMin > 1440 ? " (+1)" : ""}`;
}

/** Newest row per physical flight, like summarizeGateSides; cancelled ones are dropped here and counted by it. */
function collapse(rows: readonly MapFlightRow[], date: string): MapFlightRow[] {
  const latest = new Map<string, MapFlightRow>();
  for (const row of rows) {
    if (row.direction !== undefined && row.direction !== "departure") continue;
    const id = String(row.physicalFlightId ?? "");
    if (!id || String(row.scheduledAt ?? "").slice(0, 10) !== date) continue;
    const current = latest.get(id);
    if (!current || String(row.retrievedAt ?? "") > String(current.retrievedAt ?? "")) latest.set(id, row);
  }
  return [...latest.values()];
}

const emptySides = (): Record<GateSide, number> => ({ EAST: 0, WEST: 0, CENTER: 0, UNVERIFIED: 0 });

export function departureMap(input: {
  date: string;
  nextDate: string;
  terminal: MapTerminal;
  window: MapWindow;
  rows: readonly MapFlightRow[];
  /** The next day's rows; null when they could not be read. Only used past midnight. */
  nextRows?: readonly MapFlightRow[] | null;
}): DepartureMap {
  const { date, nextDate, terminal, window } = input;
  const needsNext = window.endMin > 1440;
  const nextDay = !needsNext ? "NOT_NEEDED" : input.nextRows && input.nextRows.length ? "COVERED" : "MISSING";
  const inWindow = (minute: number | null) => minute !== null && minute >= window.startMin && minute < window.endMin;

  // Rows of each day inside the window, before collapsing, so the side counts
  // below come from the very function the comparison card uses.
  const today = input.rows.filter((row) => (row.direction === undefined || row.direction === "departure") && inWindow(minuteOfDay(date, row.scheduledAt)));
  const tomorrow = nextDay === "COVERED"
    ? (input.nextRows ?? []).filter((row) => (row.direction === undefined || row.direction === "departure") && inWindow(minuteOfDay(date, row.scheduledAt)))
    : [];
  const counted = [summarizeGateSides(today, date), ...(tomorrow.length ? [summarizeGateSides(tomorrow, nextDate)] : [])];
  const sum = (area: BoardingArea): SideCounts => counted.reduce((total, day) => {
    const counts = day.byArea[area];
    return { EAST: total.EAST + counts.EAST, WEST: total.WEST + counts.WEST, CENTER: total.CENTER + counts.CENTER, UNVERIFIED: total.UNVERIFIED + counts.UNVERIFIED, total: total.total + counts.total };
  }, { ...emptySides(), total: 0 });

  const buildings = buildingsOf(terminal);
  const flights: MapFlight[] = [];
  for (const [rows, day, rowDate] of [[today, "SERVICE_DATE", date], [tomorrow, "NEXT_DAY", nextDate]] as const) {
    for (const row of collapse(rows, rowDate)) {
      if (String(row.status ?? "") === "cancelled") continue;
      const building = boardingAreaOf(row);
      if (!buildings.includes(building as MapBuilding)) continue;
      const code = row.airportCode === null || row.airportCode === undefined || String(row.airportCode).trim() === "" ? null : String(row.airportCode).trim();
      const destination = destinationOf(code);
      const gate = String(row.gate ?? "").trim() || null;
      flights.push({
        id: String(row.physicalFlightId),
        flightNumber: String(row.flightNumber ?? ""),
        airline: row.airlineCode ? String(row.airlineCode) : null,
        destinationCode: code,
        destination,
        group: destination?.group ?? "UNKNOWN",
        scheduledAt: String(row.scheduledAt),
        building,
        gate,
        side: gateSideOf(building, gate),
        status: String(row.status ?? "unknown"),
        position: positionOf(building, gate),
        day,
      });
    }
  }
  flights.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.flightNumber.localeCompare(b.flightNumber));

  const gateFlights = new Map<string, number>();
  for (const flight of flights) if (flight.position && flight.gate) gateFlights.set(`${flight.building}:${flight.gate}`, (gateFlights.get(`${flight.building}:${flight.gate}`) ?? 0) + 1);
  const gates: MapGate[] = buildings.flatMap((building) => Object.entries(POSITIONS[building].gates).map(([gate, point]) => ({
    building, gate, x: point.x, y: point.y, side: gateSideOf(building, gate), flights: gateFlights.get(`${building}:${gate}`) ?? 0,
  })));

  const groups = new Map<DestinationGroup, GroupRow>();
  for (const flight of flights) {
    const entry = groups.get(flight.group) ?? { group: flight.group, flights: 0, bySide: emptySides(), concourse: 0 };
    entry.flights++;
    if (flight.building === "CONCOURSE") entry.concourse++;
    else entry.bySide[flight.side]++;
    groups.set(flight.group, entry);
  }
  const order = (group: DestinationGroup) => DESTINATION_GROUPS.indexOf(group);
  const main = sum(terminal);
  return {
    terminal,
    window,
    nextDay,
    flights,
    sides: main,
    concourse: terminal === "T1" ? sum("CONCOURSE").total : null,
    unknownBuilding: sum("UNKNOWN").total,
    cancelled: counted.reduce((total, day) => total + day.cancelled, 0),
    gates,
    unplaced: {
      noGate: flights.filter((flight) => !flight.gate),
      notOnMap: flights.filter((flight) => flight.gate && !flight.position),
    },
    groups: [...groups.values()].sort((a, b) => b.flights - a.flights || order(a.group) - order(b.group)),
    unknownDestination: flights.filter((flight) => flight.group === "UNKNOWN").length,
  };
}

/** Window presets. "From now" windows start at the current KST minute of a TODAY date. */
export type WindowPreset = "DAY" | "NEXT1" | "NEXT3" | "NEXT6" | "CUSTOM";

export function presetWindow(preset: Exclude<WindowPreset, "CUSTOM">, nowMinute: number | null): MapWindow {
  if (preset === "DAY" || nowMinute === null) return { startMin: 0, endMin: 1440 };
  const hours = preset === "NEXT1" ? 1 : preset === "NEXT3" ? 3 : 6;
  return { startMin: nowMinute, endMin: nowMinute + hours * 60 };
}

/** A custom window of whole hours within the service date, start < end. */
export function customWindow(startHour: number, endHour: number): MapWindow | null {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) return null;
  return { startMin: startHour * 60, endMin: endHour * 60 };
}

/** East minus west among the flights whose side is evidenced; null when neither side has one. */
export function sideLead(sides: SideCounts): { larger: "EAST" | "WEST" | "EQUAL"; by: number } | null {
  if (sides.EAST + sides.WEST === 0) return null;
  const by = Math.abs(sides.EAST - sides.WEST);
  return { larger: sides.EAST > sides.WEST ? "EAST" : sides.WEST > sides.EAST ? "WEST" : "EQUAL", by };
}

/**
 * True when the unconfirmed flights alone could reverse the lead: then the
 * comparison sentence must keep "among confirmed flights" and say so.
 */
export function leadCouldFlip(sides: SideCounts): boolean {
  const lead = sideLead(sides);
  if (!lead) return false;
  return sides.UNVERIFIED > 0 && sides.UNVERIFIED >= lead.by;
}
