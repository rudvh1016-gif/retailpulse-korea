import type { FlightBuildingScope, MapFlightRow } from './airport-departure-map';
import { splitFromSummary, SPLIT_FRESH_MS, type FlightEstimate, type SplitTerminal } from './airport-flight-split';
import type { AirportSidesBlock } from './airport-sides-summary';
import { summarizeGateSides } from './airport-sides';

type Summary = Parameters<typeof splitFromSummary>[0];
type Source = { serviceDateKst?: string; basis?: string; retrievedAt?: string | null; truncated?: boolean; flights: readonly MapFlightRow[] };
export type TopReference = { terminal: SplitTerminal; estimate: FlightEstimate | null;
  unavailableReason?: 'GATES_PENDING' | 'NO_SIDE_COMPARISON' | 'FORECAST_UNAVAILABLE' | 'SOURCE_MISMATCH' };

/** Only a complete same-day, same-building flight set can carry a terminal-wide A5 reference. */
export function topReferences(input: { summary: Summary; sides: AirportSidesBlock | null | undefined; date: string; nowIso: string;
  scope: FlightBuildingScope | undefined; wholeDaySelected: boolean; source: Source }): TopReference[] | null {
  const { summary, sides, date, nowIso, scope, source } = input;
  if (!input.wholeDaySelected || scope === 'CONCOURSE') return null;
  if (date !== summary.serviceDateKst || source.serviceDateKst !== date || source.truncated || !source.retrievedAt) return null;
  const collected = Date.parse(source.retrievedAt), now = Date.parse(nowIso);
  if (!Number.isFinite(collected) || !Number.isFinite(now) || (summary.dayRelation !== 'PAST' && now - collected > SPLIT_FRESH_MS)) return null;
  const terminals: SplitTerminal[] = scope === 'T1' || scope === 'T2' ? [scope] : ['T1', 'T2'];
  // Count the same source once; building a second full gate map per terminal
  // would duplicate work on every tab/window interaction.
  // /api/live/flights also carries arrival rows; the official comparison and
  // departure map both use departures only.
  const departures = source.flights.filter((row) => row.direction === undefined || row.direction === 'departure');
  const day = summarizeGateSides(departures, date);
  return terminals.map((terminal) => {
    const result = splitFromSummary(summary, sides, terminal, nowIso);
    if (result.status !== 'OK' || result.split.basis !== source.basis) return { terminal, estimate: null, unavailableReason: 'SOURCE_MISMATCH' };
    const split = result.split, expected = split.expected;
    const counts = day.byArea[terminal];
    const sameCounts = counts.EAST === split.east && counts.WEST === split.west && counts.CENTER === split.center
      && counts.UNVERIFIED === split.unverified && counts.total === split.total;
    if (!sameCounts) return { terminal, estimate: null, unavailableReason: 'SOURCE_MISMATCH' };
    if (!expected) return { terminal, estimate: null, unavailableReason: counts.total > 0 && counts.UNVERIFIED === counts.total
      ? 'GATES_PENDING' : split.verified === 0 ? 'NO_SIDE_COMPARISON' : 'FORECAST_UNAVAILABLE' };
    if ((terminal === 'T1' && day.byArea.CONCOURSE.total !== expected.concourse?.flights) || day.byArea.UNKNOWN.total !== expected.outsideScope) return { terminal, estimate: null, unavailableReason: 'SOURCE_MISMATCH' };
    return { terminal, estimate: expected };
  });
}
