/**
 * Incheon Airport east/west, kept as two separate things that must never be
 * added together or read as the same place:
 *
 *   1. Departure halls (출국장) — where the airport's A5 passenger notice
 *      counts people. A5 publishes one expected-passenger figure per hall per
 *      hour; a side is the sum of its halls.
 *   2. Boarding gates (탑승구) — where A1 flights leave from. A side is a count
 *      of physical flights at gates whose side the airport's own text names.
 *
 * Hall numbers, gate numbers, entrance doors and check-in rows are different
 * numbering systems. Only config/airport-sides.v1.json decides a side, and
 * it only holds what official text states. Nothing here estimates a person
 * count from flights, seats or shares, and nothing moves a passenger count
 * from the hall's hour to a flight's departure hour.
 */
import sides from "../config/airport-sides.v1.json";
import { flightBoardingLocation } from "./flight-scope";

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
  const own = rows.filter((row) => row.terminal === terminal && row.targetDate === date && row.expectedPassengers !== null && Number.isFinite(Number(row.expectedPassengers)));
  const byBand = new Map<string, HallForecastRow[]>();
  for (const row of own) byBand.set(row.timeBandRaw, [...(byBand.get(row.timeBandRaw) ?? []), row]);
  const halls = sides.halls.filter((hall) => hall.terminal === terminal);
  const bands: HallBand[] = [...byBand.values()].map((inBand) => {
    const first = inBand[0];
    const aggregate = inBand.find((row) => row.zone === AGGREGATE_FIELD[terminal] && Boolean(row.isAggregate));
    const total = aggregate ? Number(aggregate.expectedPassengers) : null;
    const value = (field: string) => {
      const row = inBand.find((candidate) => candidate.zone === field && !candidate.isAggregate);
      return row ? Number(row.expectedPassengers) : null;
    };
    const values = halls.map((hall) => ({ side: hall.side, value: value(hall.field) }));
    const complete = values.every((entry) => entry.value !== null);
    const east = values.filter((entry) => entry.side === "EAST").reduce((sum, entry) => sum + (entry.value ?? 0), 0);
    const west = values.filter((entry) => entry.side === "WEST").reduce((sum, entry) => sum + (entry.value ?? 0), 0);
    const sidesConsistent = complete && total !== null && Math.abs(east + west - total) < 0.5;
    return {
      startAt: first.targetStartAt,
      endAt: first.targetEndAt,
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
  };
}

/** The boarding building a flight uses, from its stored terminal or an exact concourse gate. */
export function boardingAreaOf(row: { terminal?: unknown; gate?: unknown }): BoardingArea {
  const location = flightBoardingLocation(row);
  return location === "T1" || location === "T2" || location === "CONCOURSE" ? location : "UNKNOWN";
}

/** A gate's side only when official text names it; every other gate is UNVERIFIED. */
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

export interface GateSideDay {
  date: string;
  /** Physical flights leaving on the date, cancelled ones excluded. */
  total: number;
  cancelled: number;
  byArea: Record<BoardingArea, SideCounts>;
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
  const hours = new Map<number, Record<BoardingArea, SideCounts>>();
  let cancelled = 0;
  for (const row of latest.values()) {
    if (String(row.status ?? "") === "cancelled") { cancelled++; continue; }
    const area = boardingAreaOf(row);
    const side = gateSideOf(area, row.gate);
    byArea[area][side]++;
    byArea[area].total++;
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
