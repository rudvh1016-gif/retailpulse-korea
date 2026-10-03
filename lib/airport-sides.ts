/**
 * Incheon Airport east/west, kept as two separate things that must never be
 * added together or read as the same place:
 *
 *   1. Departure halls (출국장) — where the airport's A5 passenger notice
 *      counts people. A5 publishes one expected-passenger figure per hall per
 *      hour; a side is the sum of its halls.
 *   2. Boarding gates (탑승구) — where A1 flights leave from. A side is a count
 *      of physical flights at gates whose side is evidenced: named by the
 *      airport's own text (OFFICIAL_TEXT), or placed from the gate's point on
 *      the airport's official map (OFFICIAL_MAP_POSITION, KORETAIL-computed).
 *
 * Hall numbers, gate numbers, entrance doors and check-in rows are different
 * numbering systems. Only config/airport-sides.v1.json decides a side, and
 * it only holds gates with per-gate evidence (official text or official map
 * position). Nothing here estimates a person
 * count from flights, seats or shares, and nothing moves a passenger count
 * from the hall's hour to a flight's departure hour.
 */
import sides from "../config/airport-sides.v1.json" with { type: "json" };
import { flightBoardingLocation } from "./flight-scope";
import { shiftKstDay } from "./kst";

export type HallSide = "EAST" | "WEST";
export type GateSide = "EAST" | "WEST" | "CENTER" | "UNVERIFIED";
export type BoardingArea = "T1" | "T2" | "CONCOURSE" | "UNKNOWN";
export type SideTerminal = "T1" | "T2";

export const AIRPORT_SIDES_VERSION = sides.version;

const HALL_BY_FIELD = new Map(sides.halls.map((hall) => [`${hall.terminal}:${hall.field}`, hall]));
const GATE_BY_KEY = new Map(sides.gates.map((gate) => [`${gate.area}:${gate.gate}`, gate]));
const AGGREGATE_FIELD: Record<SideTerminal, string> = { T1: "t1dgsum1", T2: "t2dgsum2" };

/** The side of one official A5 departure-hall field, or null for anything else. */
export function hallSideOf(terminal: string, field: string): { hall: number; side: HallSide } | null {
  const hall = HALL_BY_FIELD.get(`${terminal}:${field}`);
  return hall ? { hall: hall.hall, side: hall.side as HallSide } : null;
}

export function hallsOn(terminal: SideTerminal, side: HallSide): number[] {
  return sides.halls.filter((hall) => hall.terminal === terminal && hall.side === side).map((hall) => hall.hall);
}

export interface HallForecastRow {
  direction?: string;
  terminal: string;
  zone: string;
  isAggregate: number | boolean;
  targetDate: string;
  timeBandRaw: string;
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number | null;
  retrievedAt: string;
}

export interface HallBand {
  startAt: string;
  endAt: string;
  /** Official terminal total for the band (t1dgsum1 / t2dgsum2). */
  total: number | null;
  east: number | null;
  west: number | null;
  /** False when a hall field is missing, or the halls do not add up to the official total. */
  sidesConsistent: boolean;
}

export type HallCoverage = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export interface HallSideDay {
  terminal: SideTerminal;
  date: string;
  bands: HallBand[];
  coverage: HallCoverage;
  /** Whole-day sums: only when all 24 bands are present and consistent. */
  day: { total: number; east: number; west: number } | null;
  /** Sums over the bands that are present and consistent, labelled as such when coverage is not COMPLETE. */
  confirmed: { total: number; east: number; west: number; bands: number };
  peakBand: HallBand | null;
  /** Newest row retrieval time among the bands used. A5 publishes no issue time, so none is invented. */
  retrievedAt: string | null;
  /** A zero here is not evidence of no actual demand at the mobility-priority exit. */
  limitations: Array<"T1_HALL_6_OUTSIDE_EXPECTED_CONGESTION">;
}

function kstHour(iso: string): number {
  return Number(iso.slice(11, 13));
}

/**
 * One terminal's day of departure-hall notices, split by side.
 *
 * A band keeps its official total; its sides are filled only when every hall
 * of the terminal has a value and the halls add up to that total, so a side
 * is never shown from a half-published band. A missing field stays missing
 * (never 0); an official 0 stays 0.
 */
export function summarizeHallSides(rows: readonly HallForecastRow[], terminal: SideTerminal, date: string): HallSideDay {
  const halls = sides.halls.filter((hall) => hall.terminal === terminal);
  const fields = new Set<string>([AGGREGATE_FIELD[terminal], ...halls.map(hall => hall.field)]);
  const own = rows.filter(row => row.terminal === terminal && row.targetDate === date
    && (row.direction === undefined || row.direction === "departure") && fields.has(row.zone)
    && /^(?:[01]\d|2[0-3])_\d{2}$/.test(row.timeBandRaw));
  const byBand = new Map<string, HallForecastRow[]>();
  // 23_00 and 23_24 name the same hour; duplicates must not be summed or picked arbitrarily.
  for (const row of own) {
    const hour = row.timeBandRaw.slice(0, 2);
    byBand.set(hour, [...(byBand.get(hour) ?? []), row]);
  }
  const bands: HallBand[] = [...byBand.values()].map((inBand) => {
    const first = inBand[0];
    const hour = Number(first.timeBandRaw.slice(0, 2));
    const startAt = `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`;
    const endAt = hour === 23 ? `${shiftKstDay(date, 1)}T00:00:00+09:00`
      : `${date}T${String(hour + 1).padStart(2, "0")}:00:00+09:00`;
    const intervalsMatch = inBand.every(row => row.targetStartAt === startAt && row.targetEndAt === endAt
      && (Number(row.timeBandRaw.slice(3)) === hour + 1 || (hour === 23 && row.timeBandRaw.slice(3) === "00")));
    const count = (row: HallForecastRow | undefined) => typeof row?.expectedPassengers === "number"
      && Number.isFinite(row.expectedPassengers) && row.expectedPassengers >= 0 ? row.expectedPassengers : null;
    const aggregate = inBand.filter(row => row.zone === AGGREGATE_FIELD[terminal] && Boolean(row.isAggregate));
    const total = aggregate.length === 1 ? count(aggregate[0]) : null;
    const value = (field: string) => {
      const candidates = inBand.filter(row => row.zone === field && !row.isAggregate);
      return candidates.length === 1 ? count(candidates[0]) : null;
    };
    const values = halls.map((hall) => ({ side: hall.side, value: value(hall.field) }));
    const complete = intervalsMatch && values.every((entry) => entry.value !== null);
    const east = values.filter((entry) => entry.side === "EAST").reduce((sum, entry) => sum + (entry.value ?? 0), 0);
    const west = values.filter((entry) => entry.side === "WEST").reduce((sum, entry) => sum + (entry.value ?? 0), 0);
    const sidesConsistent = complete && total !== null && Math.abs(east + west - total) < 0.5;
    return {
      startAt,
      endAt,
      total,
      east: sidesConsistent ? east : null,
      west: sidesConsistent ? west : null,
      sidesConsistent,
    };
  }).sort((a, b) => a.startAt.localeCompare(b.startAt));

  const usable = bands.filter((band) => band.sidesConsistent && band.total !== null);
  const hours = new Set(usable.map((band) => kstHour(band.startAt)));
  const fullDay = usable.length === 24 && hours.size === 24 && bands.length === 24;
  const sum = (key: "total" | "east" | "west") => usable.reduce((total, band) => total + Number(band[key]), 0);
  const confirmed = { total: sum("total"), east: sum("east"), west: sum("west"), bands: usable.length };
  const peakBand = fullDay ? usable.reduce((best, band) => (Number(band.total) > Number(best.total) ? band : best)) : null;
  const retrieved = own.map((row) => row.retrievedAt).filter(Boolean).sort();
  return {
    terminal,
    date,
    bands,
    coverage: fullDay ? "COMPLETE" : bands.length ? "PARTIAL" : "UNAVAILABLE",
    day: fullDay ? { total: confirmed.total, east: confirmed.east, west: confirmed.west } : null,
    confirmed,
    peakBand,
    retrievedAt: retrieved.at(-1) ?? null,
    limitations: terminal === "T1" ? ["T1_HALL_6_OUTSIDE_EXPECTED_CONGESTION"] : [],
  };
}

/** The boarding building a flight uses, from its stored terminal or an exact concourse gate. */
export function boardingAreaOf(row: { terminal?: unknown; gate?: unknown }): BoardingArea {
  const location = flightBoardingLocation(row);
  return location === "T1" || location === "T2" || location === "CONCOURSE" ? location : "UNKNOWN";
}

/**
 * Why a flight has no confirmed side:
 *   NO_GATE       no gate assigned yet (or none stored) — a map cannot fix it
 *   NOT_IN_TABLE  a real gate of this building whose side is not yet evidenced
 *   CONFLICT      a numeric gate that belongs to another building's published range
 *   NO_TERMINAL   the building itself is unknown
 */
export type UnverifiedReason = "NO_GATE" | "NOT_IN_TABLE" | "CONFLICT" | "NO_TERMINAL";
const RANGES = sides.gateRanges as Record<"T1" | "T2" | "CONCOURSE", [number, number]>;

export function unverifiedReasonOf(area: BoardingArea, gate: unknown): UnverifiedReason | null {
  const key = String(gate ?? "").trim();
  if (area === "UNKNOWN") return "NO_TERMINAL";
  if (!key) return "NO_GATE";
  if (GATE_BY_KEY.has(`${area}:${key}`)) return null;
  // CONFLICT only when a purely numeric gate belongs to another building's
  // published range (a T2 flight at gate 9). A gate outside every published
  // range (T2 291 is on the airport's own map) or with a suffix ("23A") is
  // simply not in the table.
  if (!/^\d{1,3}$/.test(key)) return "NOT_IN_TABLE";
  const number = Number(key);
  const [low, high] = RANGES[area];
  if (number >= low && number <= high) return "NOT_IN_TABLE";
  const elsewhere = (Object.entries(RANGES) as Array<[string, [number, number]]>).some(([other, [from, to]]) => other !== area && number >= from && number <= to);
  return elsewhere ? "CONFLICT" : "NOT_IN_TABLE";
}

/** A gate's side only when the table evidences it (official text or official map position); every other gate is UNVERIFIED. */
export function gateSideOf(area: BoardingArea, gate: unknown): GateSide {
  if (area === "UNKNOWN") return "UNVERIFIED";
  const key = String(gate ?? "").trim();
  if (!/^\d{1,3}$/.test(key)) return "UNVERIFIED";
  const entry = GATE_BY_KEY.get(`${area}:${key}`);
  return entry ? (entry.side as GateSide) : "UNVERIFIED";
}

export interface SideFlightRow {
  physicalFlightId?: unknown;
  terminal?: unknown;
  gate?: unknown;
  scheduledAt?: unknown;
  status?: unknown;
  retrievedAt?: unknown;
}

export type SideCounts = Record<GateSide, number> & { total: number };
const emptyCounts = (): SideCounts => ({ EAST: 0, WEST: 0, CENTER: 0, UNVERIFIED: 0, total: 0 });
export type ReasonCounts = Record<UnverifiedReason, number>;
const emptyReasons = (): ReasonCounts => ({ NO_GATE: 0, NOT_IN_TABLE: 0, CONFLICT: 0, NO_TERMINAL: 0 });

export interface GateSideDay {
  date: string;
  /** Physical flights leaving on the date, cancelled ones excluded. */
  total: number;
  cancelled: number;
  byArea: Record<BoardingArea, SideCounts>;
  /** The UNVERIFIED flights of each area, by cause (sums to byArea[area].UNVERIFIED). */
  unverifiedByArea: Record<BoardingArea, ReasonCounts>;
  /** Gates seen without an evidenced side, with their flight counts, most flights first. */
  unmappedGates: Array<{ area: BoardingArea; gate: string; flights: number }>;
  /** Scheduled KST hour (0-23) → area → side counts. */
  byHour: Array<{ hour: number; byArea: Record<BoardingArea, SideCounts> }>;
  /** Flights whose codeshare rows disagree on the gate; the newest retrieval is used. */
  reassigned: number;
  retrievedAt: string | null;
}

const areas = (): Record<BoardingArea, SideCounts> => ({ T1: emptyCounts(), T2: emptyCounts(), CONCOURSE: emptyCounts(), UNKNOWN: emptyCounts() });

/**
 * Physical departures by boarding area and gate side, whole day and by the
 * scheduled hour.
 *
 * - Codeshares collapse to one physical flight; when its rows disagree, the
 *   most recently retrieved row decides terminal and gate.
 * - Cancelled flights leave the totals and are counted apart.
 * - The hour is the scheduled departure hour. The store has no actual or
 *   estimated departure time, so none is claimed.
 * - For every area, EAST + WEST + CENTER + UNVERIFIED = total.
 */
export function summarizeGateSides(rows: readonly SideFlightRow[], date: string): GateSideDay {
  const latest = new Map<string, SideFlightRow>();
  const gatesSeen = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = String(row.physicalFlightId ?? "");
    const scheduled = String(row.scheduledAt ?? "");
    if (!id || scheduled.slice(0, 10) !== date) continue;
    gatesSeen.set(id, (gatesSeen.get(id) ?? new Set()).add(`${row.terminal ?? ""}|${row.gate ?? ""}`));
    const current = latest.get(id);
    if (!current || String(row.retrievedAt ?? "") > String(current.retrievedAt ?? "")) latest.set(id, row);
  }
  const byArea = areas();
  const unverifiedByArea: Record<BoardingArea, ReasonCounts> = { T1: emptyReasons(), T2: emptyReasons(), CONCOURSE: emptyReasons(), UNKNOWN: emptyReasons() };
  const unmapped = new Map<string, { area: BoardingArea; gate: string; flights: number }>();
  const hours = new Map<number, Record<BoardingArea, SideCounts>>();
  let cancelled = 0;
  for (const row of latest.values()) {
    if (String(row.status ?? "") === "cancelled") { cancelled++; continue; }
    const area = boardingAreaOf(row);
    const side = gateSideOf(area, row.gate);
    byArea[area][side]++;
    byArea[area].total++;
    if (side === "UNVERIFIED") {
      const reason = unverifiedReasonOf(area, row.gate) ?? "NOT_IN_TABLE";
      unverifiedByArea[area][reason]++;
      if (reason === "NOT_IN_TABLE") {
        const key = `${area}:${String(row.gate).trim()}`;
        const entry = unmapped.get(key) ?? { area, gate: String(row.gate).trim(), flights: 0 };
        entry.flights++;
        unmapped.set(key, entry);
      }
    }
    const hour = kstHour(String(row.scheduledAt));
    const bucket = hours.get(hour) ?? areas();
    bucket[area][side]++;
    bucket[area].total++;
    hours.set(hour, bucket);
  }
  const retrieved = [...latest.values()].map((row) => String(row.retrievedAt ?? "")).filter(Boolean).sort();
  return {
    date,
    total: Object.values(byArea).reduce((sum, counts) => sum + counts.total, 0),
    cancelled,
    byArea,
    unverifiedByArea,
    unmappedGates: [...unmapped.values()].sort((a, b) => b.flights - a.flights || a.gate.localeCompare(b.gate)),
    byHour: [...hours].sort((a, b) => a[0] - b[0]).map(([hour, value]) => ({ hour, byArea: value })),
    reassigned: [...gatesSeen.values()].filter((seen) => seen.size > 1).length,
    retrievedAt: retrieved.at(-1) ?? null,
  };
}

/** How many of the day's flights sit at a gate with an official side, per area. */
export function gateSideCoverage(day: GateSideDay, area: BoardingArea): number | null {
  const counts = day.byArea[area];
  return counts.total ? (counts.total - counts.UNVERIFIED) / counts.total : null;
}
