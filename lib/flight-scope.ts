/** Partition the exact collected physical-flight set; never infer a terminal from a gate. */
export function flightScopeCounts(rows: Array<{physicalFlightId?: unknown; terminal?: unknown}>) {
  const flights = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = String(row.physicalFlightId ?? '');
    if (!id) continue;
    const scopes = flights.get(id) ?? new Set<string>();
    if (typeof row.terminal === 'string' && row.terminal.trim()) scopes.add(row.terminal.trim());
    flights.set(id, scopes);
  }
  const result = {total: flights.size, T1: 0, T2: 0, other: 0, unassigned: 0, conflicting: 0};
  for (const scopes of flights.values()) {
    if (!scopes.size) result.unassigned++;
    else if (scopes.size > 1) result.conflicting++;
    else {
      const scope = [...scopes][0];
      if (scope === 'T1' || scope === 'T2') result[scope]++;
      else result.other++;
    }
  }
  return result;
}
