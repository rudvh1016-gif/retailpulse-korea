import { runD1Batches } from './d1-write-counts';
export const TRANSFER_SOURCE = 'INCHEON_TRANSFER_FORECAST';
export interface TransferForecast {
  serviceDate: string; terminal: 'T1' | 'T2'; expectedTransferPassengers: number;
  basis: 'ARRIVAL_TRANSFER_SECURITY'; sourceHash: string; schemaVersion: string;
}
export async function persistTransferForecast(db: D1Database, row: TransferForecast, retrievedAt: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.serviceDate) || !['T1','T2'].includes(row.terminal)
    || !Number.isSafeInteger(row.expectedTransferPassengers) || row.expectedTransferPassengers < 0
    || row.basis !== 'ARRIVAL_TRANSFER_SECURITY' || row.schemaVersion !== 'incheon-transfer-security-v1'
    || !/^[a-f0-9]{64}$/.test(row.sourceHash)) throw new Error('transfer_schema_rejected');
  return runD1Batches(db, [db.prepare(`INSERT INTO airport_transfer_forecast
    (source_id,service_date,terminal,expected_transfer_passengers,basis,published_at,retrieved_at,source_hash,quality_status,schema_version)
    VALUES (?,?,?,?,?,NULL,?,?,'OFFICIAL_FORECAST',?)
    ON CONFLICT(service_date,terminal) DO UPDATE SET
    expected_transfer_passengers=excluded.expected_transfer_passengers,retrieved_at=excluded.retrieved_at,
    source_hash=excluded.source_hash,schema_version=excluded.schema_version
    WHERE airport_transfer_forecast.expected_transfer_passengers != excluded.expected_transfer_passengers
      OR airport_transfer_forecast.schema_version != excluded.schema_version`)
    .bind(TRANSFER_SOURCE,row.serviceDate,row.terminal,row.expectedTransferPassengers,row.basis,retrievedAt,row.sourceHash,row.schemaVersion)]);
}

/** Verified actual server filenames differ between T1 and T2. */
export function validateTransferDownloadHeaders(headers: Headers, date: string, terminal: 'T1' | 'T2') {
  const filename = `E${date.replaceAll('-', '')}${terminal === 'T2' ? 'T2' : ''}.xls`;
  if (!/application\/(x-msdownload|vnd.ms-excel|octet-stream)(?:;|$)/i.test(headers.get('content-type') ?? '')
    || !(headers.get('content-disposition') ?? '').split(';').some(part => part.trim() === `filename=${filename}` || part.trim() === `filename="${filename}"`)) {
    throw new Error('SCHEMA_DOWNLOAD_HEADERS');
  }
}
