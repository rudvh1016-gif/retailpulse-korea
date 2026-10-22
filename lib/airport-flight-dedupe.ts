interface PhysicalFlightRecord { physicalFlightId: string; codeshare: string | null }

/** Prefer the operating row regardless of marketing-row order or metadata presence. */
export function retainOperatingFlight<T extends PhysicalFlightRecord>(records: Map<string, T>, record: T): void {
  const prior = records.get(record.physicalFlightId);
  if (!prior || prior.codeshare === 'Y' || record.codeshare !== 'Y') records.set(record.physicalFlightId, record);
}

export function dedupePhysicalFlights<T extends PhysicalFlightRecord>(records: Iterable<T>): T[] {
  const unique = new Map<string, T>();
  for (const record of records) retainOperatingFlight(unique, record);
  return [...unique.values()];
}
