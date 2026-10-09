// One read per newly approved provider. No D1, writes, retries, key/URL/payload logs.
const selection = process.env.RPK_FACILITY_CONTRACT_SCOPE;
if (!['parking', 'lockers'].includes(selection)) throw new Error('unknown_contract_scope');
const key = process.env[selection === 'parking' ? 'DATA_GO_KR_SERVICE_KEY' : 'SEOUL_OPEN_DATA_KEY'];
if (!key?.trim()) {
  console.log(JSON.stringify({ source: selection, status: 'NEEDS_KEY', providerRequests: 0 }));
  process.exitCode = 1;
} else {
  let status = 'ERROR', httpStatus = null, rows = 0, total = null, code = null, schemaValid = false;
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
    const service = selection === 'parking' ? payload.response?.body : payload.getFcLckr;
    const reportedCode = selection === 'parking' ? payload.response?.header?.resultCode : service?.RESULT?.CODE ?? payload.RESULT?.CODE;
    code = /^[A-Z0-9-]{1,20}$/.test(String(reportedCode)) ? String(reportedCode) : null;
    const sourceRows = selection === 'parking' ? service?.items?.item : service?.row;
    const items = Array.isArray(sourceRows) ? sourceRows : sourceRows && typeof sourceRows === 'object' ? [sourceRows] : [];
    rows = items.length;
    const count = Number(selection === 'parking' ? service?.totalCount : service?.list_total_count);
    total = Number.isSafeInteger(count) && count >= 0 ? count : null;
    schemaValid = rows > 0 && total !== null && total <= 1000 && rows === total
      && (selection === 'parking'
        ? items.every(row => typeof row.floor === 'string' && /^\d+$/.test(String(row.parking)) && /^\d+$/.test(String(row.parkingarea)) && /^\d{14}(?:\.\d+)?$/.test(String(row.datetm)))
        : items.every(row => typeof row === 'object' && row !== null && Object.keys(row).some(field => field.toLowerCase() === 'totcrtrdt')));
    status = (code === '00' || code === 'INFO-000') && schemaValid ? 'CONTRACT_OK' : 'CONTRACT_UNVERIFIED';
  } catch { /* Never echo request errors: they may contain the secret URL. */ }
  console.log(JSON.stringify({ source: selection, status, httpStatus, code, rows, total, schemaValid, providerRequests: 1, retries: 0, databaseReads: 0, databaseWrites: 0 }));
  if (status !== 'CONTRACT_OK') process.exitCode = 1;
}
