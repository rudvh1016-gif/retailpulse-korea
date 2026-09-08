import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { persistTransferForecast, validateTransferDownloadHeaders, transferServiceDate, type TransferForecast } from '../lib/transfer-forecast';

test('transfer rows are dated, idempotent, and last-good values survive rejected writes', async () => {
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('drizzle/0019_airport_transfer_forecast.sql','utf8'));
  const db={prepare(query:string){return {bind(...params:unknown[]){return {query,params};}};},async batch(statements:{query:string;params:never[]}[]){return statements.map(s=>{const result=sql.prepare(s.query).run(...s.params);return {meta:{changes:Number(result.changes)}};});}} as unknown as D1Database;
  const row:TransferForecast={serviceDate:'2026-09-09',terminal:'T1',expectedTransferPassengers:559,basis:'ARRIVAL_TRANSFER_SECURITY',sourceHash:'a'.repeat(64),schemaVersion:'incheon-transfer-security-v1'};
  try {
    assert.equal((await persistTransferForecast(db,row,'2026-09-08T08:10:00Z')).changedRows,1);
    assert.equal((await persistTransferForecast(db,row,'2026-09-08T08:30:00Z')).changedRows,0);
    await assert.rejects(()=>persistTransferForecast(db,{...row,expectedTransferPassengers:NaN},'2026-09-08T09:00:00Z'));
    await persistTransferForecast(db,{...row,serviceDate:'2026-09-10',expectedTransferPassengers:600},'2026-09-09T08:10:00Z');
    const rows=sql.prepare('SELECT service_date,expected_transfer_passengers,retrieved_at FROM airport_transfer_forecast ORDER BY service_date').all();
    assert.equal(rows.length,2);assert.equal(rows[0].expected_transfer_passengers,559);assert.equal(rows[0].retrieved_at,'2026-09-08T08:10:00Z');
  } finally {sql.close();}
});

test('actual official T1/T2 filename contracts and wrong-date responses', () => {
  for (const [terminal,filename] of [['T1','E20260909.xls'],['T2','E20260909T2.xls']] as const) {
    const headers=new Headers({'content-type':'application/x-msdownload; charset=UTF-8;','content-disposition':`attachment; filename=${filename};`});
    assert.doesNotThrow(()=>validateTransferDownloadHeaders(headers,'2026-09-09',terminal));
    assert.throws(()=>validateTransferDownloadHeaders(headers,'2026-09-10',terminal));
    headers.set('content-type','text/html');
    assert.throws(()=>validateTransferDownloadHeaders(headers,'2026-09-09',terminal));
  }
});

test('publication service date respects17 KST, midnight, and year rollover', () => {
  for (const [now,date] of [['2026-09-08T07:59:00Z','2026-09-08'],['2026-09-08T08:10:00Z','2026-09-09'],['2026-09-08T15:01:00Z','2026-09-09'],['2026-12-31T08:30:00Z','2027-01-01']]) {
    assert.equal(transferServiceDate(new Date(now)),date);
  }
});
