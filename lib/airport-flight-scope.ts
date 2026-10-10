/** Choose one evidenced basis per building; never blend schedules with records. */
export interface TerminalFlightFallback<Row> {
  basis: 'OFFICIAL_DEPARTURE_SCHEDULE';
  flights: Row[];
  retrievedAt: string | null;
  truncated: boolean;
}
export function scopedFlightPayload<Row, T extends {
  flights: Row[]; basis?: string; retrievedAt?: string | null; truncated?: boolean;
  terminalFallbacks?: Record<string, TerminalFlightFallback<Row>>;
}>(payload:T, scope:string):T {
  const fallback=scope==='all'?undefined:payload.terminalFallbacks?.[scope];
  return fallback?{...payload,...fallback}:payload;
}
