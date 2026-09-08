/** Presentation-only arithmetic, never an official or deduplicated passenger total. */
export function passengerReferenceSum(hall: number | null | undefined, coverage: string | undefined,
  date: string, terminal: 'all' | 'T1' | 'T2',
  rows: {terminal: string; serviceDate: string; expectedTransferPassengers: number}[] = []) {
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!valid(hall) || coverage !== 'COMPLETE') return null;
  const scopes = terminal === 'all' ? ['T1','T2'] : [terminal];
  const selected = rows.filter(r => r.serviceDate === date && scopes.includes(r.terminal));
  if (selected.length !== scopes.length || scopes.some(t => selected.filter(r => r.terminal === t).length !== 1)
    || selected.some(r => !valid(r.expectedTransferPassengers))) return null;
  const transfer = selected.reduce((sum,r) => sum + r.expectedTransferPassengers,0);
  if (!valid(transfer) || !valid(hall + transfer)) return null;
  return {hall, transfer, total: hall + transfer};
}
