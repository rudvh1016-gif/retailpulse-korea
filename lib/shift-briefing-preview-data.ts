/** Local design-review examples. These values are not airport observations. */
import type { FlightsPayload } from '../app/flights-client';
import type { TerminalDay } from './airport-day-compare';
import type { MapFlightRow } from './airport-departure-map';
import { AIRPORT_SIDES_VERSION, boardingAreaOf } from './airport-sides';
import type { BusinessPreferences } from './business-preferences';
import type { GlanceWeekReference } from './glance-week-comparison';
import {
  buildShiftBriefing,
  type ShiftBriefingInput,
  type ShiftBriefingResult,
  type ShiftHistoryRow,
} from './shift-briefing';

export type ShiftPreviewState = 'first' | 'saved' | 'unchanged' | 'missing' | 'partial';
export type ShiftPreviewWidth = 'desktop' | 'mobile';
export const SHIFT_PREVIEW_MOBILE_SIZES = [320, 360, 390, 430] as const;
export type ShiftPreviewMobileSize = typeof SHIFT_PREVIEW_MOBILE_SIZES[number];

export const SHIFT_PREVIEW_DAY = '2026-11-01';
export const SHIFT_PREVIEW_NOW = '2026-11-01T08:30:00+09:00';
export const SHIFT_PREVIEW_COLLECTED = '2026-11-01T08:20:00+09:00';
export const SHIFT_PREVIEW_PREVIOUS = '2026-11-01T08:00:00+09:00';

export const SHIFT_PREVIEW_PREFERENCES: BusinessPreferences = {
  version: 1,
  place: 'airport',
  terminal: 'T2',
  side: 'WEST',
  hours: { open: '07:00', close: '15:00' },
};

// Day totals match the explicitly labelled example surrounding the new section:
// T1 main 152, concourse 140, T2 258. No production API is read by this module.
const EXAMPLE_HOURS = {
  T1: [1, 0, 0, 0, 1, 3, 5, 9, 13, 17, 13, 11, 9, 10, 11, 8, 8, 7, 6, 5, 5, 4, 3, 3],
  T2: [2, 1, 1, 1, 2, 5, 10, 16, 22, 24, 20, 17, 16, 19, 18, 16, 15, 12, 10, 9, 7, 5, 4, 6],
  CONCOURSE: [0, 0, 0, 0, 1, 4, 5, 8, 10, 12, 10, 10, 9, 11, 10, 8, 8, 7, 6, 5, 5, 4, 4, 3],
} as const;

// All three sides are evidenced by the repository's existing gate mapping.
const EXAMPLE_GATES = {
  T1: { WEST: '29', CENTER: '27', EAST: '9' },
  T2: { WEST: '225', CENTER: '250', EAST: '268' },
  CONCOURSE: { WEST: '123', CENTER: '114', EAST: '107' },
} as const;

function exampleFlights(partial: boolean, longDestinations: boolean): MapFlightRow[] {
  let unplaced = 0;
  return (Object.keys(EXAMPLE_HOURS) as Array<keyof typeof EXAMPLE_HOURS>).flatMap(building =>
    EXAMPLE_HOURS[building].flatMap((count, hour) => Array.from({ length: count }, (_, index) => {
      const side = index % 5 === 0 ? 'CENTER' : index % 2 === 0 ? 'WEST' : 'EAST';
      const omitGate = partial && building === 'T2' && hour === 9 && unplaced++ < 3;
      return {
        physicalFlightId: `review-${building}-${hour}-${index}`,
        flightNumber: `EX${hour}${String(index).padStart(2, '0')}`,
        terminal: building === 'CONCOURSE' ? 'T1' : building,
        gate: omitGate ? null : EXAMPLE_GATES[building][side],
        direction: 'departure',
        airportCode: (longDestinations ? ['DXB', 'LHR', 'AKL', 'LAX'] : ['NRT', 'PEK', 'TPE', 'LAX'])[index % 4],
        scheduledAt: `${SHIFT_PREVIEW_DAY}T${String(hour).padStart(2, '0')}:${String(index % 2 === 0 ? 10 : 40).padStart(2, '0')}:00+09:00`,
        retrievedAt: SHIFT_PREVIEW_COLLECTED,
        status: 'scheduled',
      };
    })),
  );
}

function dayProfile(day: string, terminal: 'T1' | 'T2'): TerminalDay {
  const adjustment = day === '2026-10-25' ? -2 : 1;
  const hours = EXAMPLE_HOURS[terminal].map((count, hour) => Math.max(0,
    count + (terminal === 'T1' ? EXAMPLE_HOURS.CONCOURSE[hour] : 0)
    + (hour >= 7 && hour < 15 ? adjustment : 0),
  ));
  const total = hours.reduce((sum, value) => sum + value, 0);
  return {
    day, complete: true, sidesVersion: AIRPORT_SIDES_VERSION, total, hours,
    sides: [0, 0, 0, total], groups: {},
  };
}

const EXAMPLE_HISTORY: ShiftHistoryRow[] = Array.from({ length: 31 }, (_, index) => {
  const day = `2026-10-${String(index + 1).padStart(2, '0')}`;
  return { T1: dayProfile(day, 'T1'), T2: dayProfile(day, 'T2') };
});

function scanReference(flights: readonly MapFlightRow[]): GlanceWeekReference {
  const selectedFlights = { all: flights.length, T1: 0, T2: 0, CONCOURSE: 0 };
  for (const flight of flights) {
    const building = boardingAreaOf(flight);
    if (building !== 'UNKNOWN') selectedFlights[building]++;
  }
  return {
    day: SHIFT_PREVIEW_DAY,
    previousDay: '2026-10-25',
    passengers: { all: null, T1: null, T2: null },
    flights: null,
    selectedFlights,
    selectedFlightSnapshot: {
      day: SHIFT_PREVIEW_DAY, retrievedAt: SHIFT_PREVIEW_COLLECTED, provisional: true,
    },
  };
}

export function shiftPreviewResults(preferences: BusinessPreferences, state: ShiftPreviewState, longDestinations = false): {
  result: ShiftBriefingResult;
  areaReference: ShiftBriefingResult | null;
} {
  const fullRows = exampleFlights(state === 'partial', longDestinations);
  const rows = state === 'partial' ? fullRows.filter(row => !['review-T2-9-2', 'review-T2-9-3'].includes(String(row.physicalFlightId))) : fullRows;
  const flights: FlightsPayload | null = state === 'missing' ? null : {
    mode: 'live-flights',
    serviceDateKst: SHIFT_PREVIEW_DAY,
    basis: 'COLLECTED_FLIGHT_RECORDS',
    flights: rows,
    retrievedAt: SHIFT_PREVIEW_COLLECTED,
    truncated: false,
  };
  const input: ShiftBriefingInput = {
    day: SHIFT_PREVIEW_DAY,
    nowIso: SHIFT_PREVIEW_NOW,
    terminal: preferences.terminal,
    side: null,
    hours: preferences.hours,
    flights,
    history: state === 'missing' ? null : EXAMPLE_HISTORY,
    weekReference: scanReference(fullRows),
    checkedAt: SHIFT_PREVIEW_COLLECTED,
  };
  return {
    result: buildShiftBriefing(input),
    areaReference: preferences.side ? buildShiftBriefing({ ...input, side: preferences.side }) : null,
  };
}
