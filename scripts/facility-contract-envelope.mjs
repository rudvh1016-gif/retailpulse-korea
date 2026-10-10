/** Structure only. Never returns provider row values, raw bodies, keys or request URLs. */
const keys = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.keys(value).filter(key => /^[A-Za-z0-9_]{1,50}$/.test(key)).slice(0,60) : [];
export function inspectFacilityEnvelope(payload, source) {
  const wrapped = payload?.response;
  const service = source === 'parking' ? wrapped?.body
    : wrapped?.body ?? Object.entries(payload ?? {}).find(([name]) => name.toLowerCase() === 'getfclckr')?.[1];
  const reportedCode = wrapped?.header?.resultCode ?? service?.RESULT?.CODE ?? payload?.RESULT?.CODE;
  const code = /^[A-Z0-9-]{1,20}$/.test(String(reportedCode)) ? String(reportedCode) : null;
  const sourceRows = service?.items?.item ?? service?.items ?? service?.item ?? service?.row;
  const items = Array.isArray(sourceRows) ? sourceRows : sourceRows && typeof sourceRows === 'object' && !('item' in sourceRows) ? [sourceRows] : [];
  const count = service?.totalCount ?? service?.list_total_count;
  const total = count !== undefined && count !== null && String(count).trim() !== '' && Number.isSafeInteger(Number(count)) && Number(count)>=0 ? Number(count) : null;
  const codeOk = code === '00' || code === 'INFO-000';
  const shape = items.length > 0 && items.every(row => row && typeof row === 'object' && !Array.isArray(row)
    && (source === 'parking'
      ? typeof row.floor === 'string' && /^\d+$/.test(String(row.parking)) && /^\d+$/.test(String(row.parkingarea)) && /^\d{14}(?:\.\d+)?$/.test(String(row.datetm))
      : Object.keys(row).some(field => field.replaceAll('_','').toLowerCase() === 'totcrtrdt')));
  const schemaValid = codeOk && shape && total !== null && total <= 1000 && items.length === total;
  // A passing shape check is not verification of vacancy semantics, coordinates or source freshness.
  return {status:schemaValid ? 'STRUCTURE_OK' : 'CONTRACT_UNVERIFIED',code,rows:items.length,total,schemaValid,
    envelopeKeys:keys(payload),serviceKeys:keys(service),rowFields:keys(items[0])};
}
