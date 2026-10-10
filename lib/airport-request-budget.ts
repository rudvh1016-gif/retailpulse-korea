/** Conservative atomic reservations shared by scheduled, retry and manual A1 scans.
 * Uses the existing collector ledger. Crashed jobs retain the full reservation;
 * completed jobs settle only to the exact attempts counted before each request.
 * Rolling 24 hours avoids assuming the provider's daily-reset timezone.
 */
export async function reserveAirportRequestBudget(db:Pick<D1Database,'prepare'>,nowIso:string,maxRequests:number,runId=crypto.randomUUID()) {
 if(!Number.isFinite(Date.parse(nowIso))||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>125)return false;
 // Keep reservations another 30 minutes because calls may occur throughout
 // the bounded job, rather than exactly at its start.
 const since=new Date(Date.parse(nowIso)-86_400_000-30*60_000).toISOString();
 // collector_runs has a unique source/start index. Preserve a valid ISO clock
 // while giving simultaneous reservations distinct microsecond suffixes.
 const uniqueAt=new Date(nowIso).toISOString().replace('Z',String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,'0')+'Z');
 const result=await db.prepare(`INSERT INTO collector_runs
  (run_id,source_id,started_at,finished_at,status,records_read,records_written,detail)
  SELECT ?, 'INCHEON_FLIGHT_REQUEST_BUDGET', ?, ?, 'RESERVED', ?, 0, 'A1 rolling-24h request ceiling; reservation, not actual calls'
  WHERE COALESCE((SELECT SUM(records_read) FROM collector_runs WHERE source_id='INCHEON_FLIGHT_REQUEST_BUDGET' AND started_at>?),0)
   + COALESCE((SELECT SUM(CASE WHEN status='SUCCESS' AND detail LIKE 'recent %; requests %'
       THEN CAST(substr(detail,instr(detail,'requests ')+9) AS INTEGER) ELSE 125 END)
       FROM collector_runs WHERE source_id='INCHEON_FLIGHT_DETAIL' AND started_at>?
       AND started_at<COALESCE((SELECT MIN(started_at) FROM collector_runs WHERE source_id='INCHEON_FLIGHT_REQUEST_BUDGET' AND started_at>?),?)
       AND status IN ('SUCCESS','ERROR')),0) + ? <= 500
  RETURNING run_id`).bind(runId,uniqueAt,nowIso,maxRequests,since,since,since,nowIso,maxRequests).run();
 return (result.results??[]).some(row=>(row as {run_id?:string}).run_id===runId);
}

/** Release only proven unused capacity; a missing/failed settlement stays conservative. */
export async function settleAirportRequestBudget(db:Pick<D1Database,'prepare'>,runId:string,issued:number) {
 if(!Number.isSafeInteger(issued)||issued<0||issued>125)return;
 await db.prepare(`UPDATE collector_runs SET records_read=?,status='SETTLED',detail='A1 rolling-24h exact counted request attempts'
  WHERE run_id=? AND source_id='INCHEON_FLIGHT_REQUEST_BUDGET' AND status='RESERVED' AND records_read>=?`).bind(issued,runId,issued).run();
}
