/** Boarding location only, not check-in terminal or passenger nationality.
 * Official gate map: https://www.airport.kr/ap_ko/886/subview.do
 * Unknown stored terminal plus an exact gate 101–132 proves concourse use.
 * Never overwrite an explicit terminal or classify a missing/ambiguous gate.
 */
export function flightBoardingLocation(row: {terminal?: unknown; gate?: unknown}): string | null {
  const terminal = typeof row.terminal === 'string' ? row.terminal.trim() : '';
  if (terminal) return terminal;
  const gate = String(row.gate ?? '').trim();
  return /^\d{3}$/.test(gate) && Number(gate) >= 101 && Number(gate) <= 132 ? 'CONCOURSE' : null;
}
/** Partition the exact collected physical-flight set by evidenced boarding location. */
export function flightScopeCounts(rows: Array<{physicalFlightId?: unknown; terminal?: unknown; gate?: unknown}>) {
  const flights = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = String(row.physicalFlightId ?? '');
    if (!id) continue;
    const scopes = flights.get(id) ?? new Set<string>();
    const location = flightBoardingLocation(row);
    if (location) scopes.add(location);
    flights.set(id, scopes);
  }
  const result = {total: flights.size, T1: 0, T2: 0, CONCOURSE: 0, other: 0, unassigned: 0, conflicting: 0};
  for (const scopes of flights.values()) {
    if (!scopes.size) result.unassigned++;
    else if (scopes.size > 1) result.conflicting++;
    else {
      const scope = [...scopes][0];
      if (scope === 'T1' || scope === 'T2' || scope === 'CONCOURSE') result[scope]++;
      else result.other++;
    }
  }
  return result;
}
