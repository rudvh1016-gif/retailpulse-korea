export interface AirportForecastAggregateRow {
  terminal: string;
  direction: string;
  isAggregate: number;
  targetDate: string;
  timeBandRaw: string;
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
  retrievedAt: string;
}

export interface AirportTodayFlightRow {
  physicalFlightId: string;
  terminal: string | null;
  gate: string | null;
  retrievedAt: string;
}

export interface AirportCongestionSummaryRow {
  terminal: string;
  zone: string;
  waitTimeMinutes: number | null;
  waitTimeRaw: string | null;
  waitingCount: number | null;
  observedAt: string;
  freshness?: "LIVE" | "STALE";
}

export function summarizeTodayPassengerForecast(rows: AirportForecastAggregateRow[]) {
  const official = rows.filter((row) => row.direction === "departure" && row.isAggregate === 1);
  const terminalTotals = new Map<string, number>();
  const bands = new Map<string, { targetStartAt: string; targetEndAt: string; expectedPassengers: number }>();
  let retrievedAt: string | null = null;
  for (const row of official) {
    terminalTotals.set(row.terminal, (terminalTotals.get(row.terminal) ?? 0) + Number(row.expectedPassengers));
    const key = `${row.targetStartAt}|${row.targetEndAt}`;
    const band = bands.get(key) ?? { targetStartAt: row.targetStartAt, targetEndAt: row.targetEndAt, expectedPassengers: 0 };
    band.expectedPassengers += Number(row.expectedPassengers);
    bands.set(key, band);
    if (!retrievedAt || row.retrievedAt > retrievedAt) retrievedAt = row.retrievedAt;
  }
  const timeline = [...bands.values()].sort((a, b) => a.targetStartAt.localeCompare(b.targetStartAt));
  const peak = timeline.reduce<(typeof timeline)[number] | null>((best, row) => !best || row.expectedPassengers > best.expectedPassengers ? row : best, null);
  return {
    total: official.length ? [...terminalTotals.values()].reduce((sum, value) => sum + value, 0) : null,
    byTerminal: Object.fromEntries([...terminalTotals.entries()].sort()),
    timeline,
    peak: peak ? { ...peak } : null,
    retrievedAt,
  };
}

export function summarizeTodayTopGate(rows: AirportTodayFlightRow[], minimumCoverage = 0.5, totalDistinctFlights?: number) {
  const physical = new Map<string, AirportTodayFlightRow>();
  for (const row of rows) {
    const current = physical.get(row.physicalFlightId);
    if (!current || (!current.gate?.trim() && row.gate?.trim())) physical.set(row.physicalFlightId, row);
  }
  const flights = [...physical.values()];
  const withGate = flights.filter((row) => row.gate?.trim());
  const total = totalDistinctFlights ?? flights.length;
  const coverage = total ? withGate.length / total : 0;
  const counts = new Map<string, { terminal: string | null; gate: string; flights: number }>();
  for (const row of withGate) {
    const gate = row.gate!.trim();
    const key = `${row.terminal ?? ""}|${gate}`;
    const current = counts.get(key) ?? { terminal: row.terminal, gate, flights: 0 };
    current.flights += 1;
    counts.set(key, current);
  }
  const top = [...counts.values()].sort((a, b) => b.flights - a.flights || `${a.terminal}${a.gate}`.localeCompare(`${b.terminal}${b.gate}`))[0] ?? null;
  const retrievedAt = rows.reduce<string | null>((latest, row) => !latest || row.retrievedAt > latest ? row.retrievedAt : latest, null);
  return {
    departuresTrackedToday: total || null,
    gateCoverageRatio: coverage,
    topDepartureGate: top && coverage >= minimumCoverage ? top : null,
    retrievedAt,
  };
}

export function summarizeCurrentBusiestDepartureHalls(rows: AirportCongestionSummaryRow[]) {
  const byTerminal = new Map<string, AirportCongestionSummaryRow>();
  for (const row of rows) {
    const current = byTerminal.get(row.terminal);
    const score = row.waitTimeMinutes ?? row.waitingCount ?? -1;
    const currentScore = current ? current.waitTimeMinutes ?? current.waitingCount ?? -1 : -1;
    if (!current || score > currentScore) byTerminal.set(row.terminal, row);
  }
  return Object.fromEntries([...byTerminal.entries()].sort());
}
