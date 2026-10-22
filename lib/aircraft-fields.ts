/** Optional public aircraft metadata, not a cabin configuration or passenger record. */
export interface AircraftFields { aircraftSubtype?: string | null; aircraftRegNo?: string | null }

function token(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim().toUpperCase();
  if (!result || result.length > max || !/^[A-Z0-9][A-Z0-9 -]*$/.test(result) || ['UNKNOWN', 'NIL', 'NONE', 'NULL', 'NA'].includes(result)) return null;
  return result;
}

/** A1 names only; do not guess a subtype from a flight number or generic model field. */
export function readAircraftFields(raw: Record<string, unknown>): Required<AircraftFields> {
  const registration = [raw.regNo, raw.aircraftRegNo].map(value => token(value, 16)).filter((value): value is string => value !== null);
  return { aircraftSubtype: token(raw.aircraftSubtype, 32),
    aircraftRegNo: new Set(registration).size === 1 ? registration[0] : null };
}

/** Keep absent metadata out of legacy payloads/hashes; disappearance is a real change. */
export function presentAircraftFields(row: AircraftFields): AircraftFields {
  return { ...(row.aircraftSubtype ? {aircraftSubtype: row.aircraftSubtype} : {}),
    ...(row.aircraftRegNo ? {aircraftRegNo: row.aircraftRegNo} : {}) };
}
