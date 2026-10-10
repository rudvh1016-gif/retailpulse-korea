import { inspectFacilityEnvelope } from './facility-contract-envelope.mjs';
// One read per newly approved provider. No D1, writes, retries, key/URL/payload logs.
const selection = process.env.RPK_FACILITY_CONTRACT_SCOPE;
if (!['parking', 'lockers'].includes(selection)) throw new Error('unknown_contract_scope');
const key = process.env[selection === 'parking' ? 'DATA_GO_KR_SERVICE_KEY' : 'SEOUL_OPEN_DATA_KEY'];
if (!key?.trim()) {
  console.log(JSON.stringify({ source: selection, status: 'NEEDS_KEY', providerRequests: 0 }));
  process.exitCode = 1;
} else {
  let status = 'ERROR', httpStatus = null, rows = 0, total = null, code = null, schemaValid = false, envelopeKeys = [], serviceKeys = [], rowFields = [];
  try {
    const url = selection === 'parking'
      ? new URL('https://apis.data.go.kr/B551177/StatusOfParking/getTrackingParking')
      : new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key.trim())}/json/getFcLckr/1/1000/`);
    if (selection === 'parking') {
      url.searchParams.set('serviceKey', key.trim());
      url.searchParams.set('type', 'json');
      url.searchParams.set('numOfRows', '100');
      url.searchParams.set('pageNo', '1');
    }
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    httpStatus = response.status;
    if (!response.ok) throw new Error('http');
    const raw = await response.text();
    if (raw.length > 2_000_000) throw new Error('response_too_large');
    const payload = JSON.parse(raw);
    ({status,code,rows,total,schemaValid,envelopeKeys,serviceKeys,rowFields}=inspectFacilityEnvelope(payload,selection));
  } catch { /* Never echo request errors: they may contain the secret URL. */ }
  console.log(JSON.stringify({ source: selection, status, httpStatus, code, rows, total, schemaValid, envelopeKeys, serviceKeys, rowFields, providerRequests: 1, retries: 0, databaseReads: 0, databaseWrites: 0 }));
  if (status !== 'STRUCTURE_OK') process.exitCode = 1;
}
