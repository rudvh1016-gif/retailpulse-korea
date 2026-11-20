/** Publish an already captured A4 generation and its evidence. */
import {createA4D1Stores} from './a4-overflow-d1-adapter';
import {publishA4Generation,type A4Pointer} from './a4-overflow-publication';
import {selectA4WriteTarget} from './a4-overflow-routing';
import type {CanonicalAirportCongestion} from './source-adapters';

type Database=Pick<D1Database,'prepare'|'batch'>;
type Capture={
 terminal:A4Pointer['terminal'];rows:readonly CanonicalAirportCongestion[];
 startedAt:string;finishedAt:string;status:'SUCCESS'|'PARTIAL';
};
const versions={T1:'airport-congestion-v1',T2:'airport-congestion-t2-v1'};
const source='INCHEON_DEPARTURE_CONGESTION';
const utc=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
 &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

function captureEvidence(input:Capture){
 const {terminal,startedAt,finishedAt,status}=input;
 const row=input.rows[0],sourceId=terminal==='T1'?source:`${source}_T2`,schema=versions[terminal];
 if(!row||!schema||!utc(startedAt)||!utc(finishedAt)||startedAt>finishedAt||!utc(row.retrievedAt)
  ||row.retrievedAt<startedAt||row.retrievedAt>finishedAt||(status!=='SUCCESS'&&status!=='PARTIAL')
  ||input.rows.some(r=>r.terminal!==terminal||r.sourceId!==sourceId||r.recordOrigin!=='LIVE'||r.freshness!=='LIVE'
   ||typeof r.zone!=='string'||!r.zone.trim()||r.schemaVersion!==schema||r.retrievedAt!==row.retrievedAt||r.observedAt!==row.observedAt
   ||!Number.isFinite(Date.parse(r.observedAt))||Date.parse(r.observedAt)>Date.parse(r.retrievedAt)
   ||!(r.qualityStatus==='VALID'||terminal==='T2'&&r.qualityStatus==='PARTIAL')
   ||!Number.isSafeInteger(r.waitingCount)||r.waitingCount<0
   ||r.waitTimeMinutes!==null&&(!Number.isSafeInteger(r.waitTimeMinutes)||r.waitTimeMinutes<0)
   ||(r.waitTimeRaw!==null&&typeof r.waitTimeRaw!=='string')||!/^[0-9a-f]{64}$/.test(r.sourceHash)))
  throw new Error('invalid_a4_evidence');
 return {sourceId,schema,eventAt:row.observedAt,retrievedAt:row.retrievedAt,
  startedAt,finishedAt,status,recordsRead:terminal==='T1'?1:input.rows.length};
}

/** Stage an immutable shard generation/readback, then atomically publish exactly
 * three primary writes and an in-transaction assertion. All primary writes are conditioned on the pointer
 * advancing; ties/replays/late writers cannot mutate run or health. */
export async function publishA4CaptureWithEvidence(
 input:Capture,dbs:{primary:Database;overflow:Database},routing:Parameters<typeof selectA4WriteTarget>[0],
){
 const metadata=captureEvidence(input);
 if(selectA4WriteTarget(routing,input.terminal,input.rows)!=='overflow')throw new Error('a4_overflow_not_selected');
 const rows=input.rows.map(({sourceId,recordOrigin,terminal,zone,waitTimeMinutes,waitTimeRaw,waitingCount,observedAt,
  retrievedAt,freshness,schemaVersion,qualityStatus,sourceHash})=>({sourceId,recordOrigin,terminal,zone,waitTimeMinutes,
  waitTimeRaw,waitingCount,observedAt,retrievedAt,freshness,schemaVersion,qualityStatus,sourceHash}));
 const {sourceId,schema,eventAt,retrievedAt,startedAt,finishedAt,status,recordsRead}=metadata;
 const stores=createA4D1Stores({
  ...dbs,
  preparePrimaryPointer:(db,p)=>db.prepare(`
   INSERT INTO a4_pointer(terminal,observed_at,digest,row_count)
   SELECT ?,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM a4_cutover WHERE terminal=? AND cutover_at=?))
   AND
   NOT EXISTS (SELECT 1 FROM collector_runs WHERE source_id=? AND started_at>=?)
   AND NOT EXISTS (SELECT 1 FROM source_health WHERE source_id=? AND
    (updated_at>=? OR julianday(last_event_at)>=julianday(?)))
   ON CONFLICT(terminal) DO UPDATE SET observed_at=excluded.observed_at,digest=excluded.digest,row_count=excluded.row_count
   WHERE excluded.observed_at>a4_pointer.observed_at
  `).bind(p.terminal,p.observedAt,p.digest,p.count,Number(routing.requireCutoverWitness===true),p.terminal,
    routing.cutoverAt??null,sourceId,startedAt,sourceId,finishedAt,eventAt),
  preparePrimaryEvidence:(db,p)=>{
   const runId=`a4-overflow-v1:${p.digest}`;
   const detail=`A4 overflow v1; terminal ${p.terminal}; normalized ${p.count}; capture sha256 ${p.digest}; primary observation rows unchanged`;
   const pointerGuard='EXISTS(SELECT 1 FROM a4_pointer WHERE terminal=? AND observed_at=? AND digest=? AND row_count=?)';
   const pointerValues=[p.terminal,p.observedAt,p.digest,p.count] as const;
   const runGuard=`EXISTS(SELECT 1 FROM collector_runs WHERE run_id=? AND source_id=? AND started_at=? AND finished_at=?
      AND status=? AND records_read=? AND records_written=? AND detail=?)`;
   const runValues=[runId,sourceId,startedAt,finishedAt,status,recordsRead,p.count,detail] as const;
   return [
    db.prepare(`INSERT INTO collector_runs
     (run_id,source_id,started_at,finished_at,status,records_read,records_written,detail)
     SELECT ?,?,?,?,?,?,?,? WHERE ${pointerGuard}
      AND NOT EXISTS(SELECT 1 FROM collector_runs WHERE source_id=? AND started_at>=?)`)
     .bind(...runValues,...pointerValues,sourceId,startedAt),
    db.prepare(`INSERT INTO source_health
     (source_id,status,last_event_at,last_retrieved_at,consecutive_failures,schema_version,detail,updated_at)
     SELECT ?,'LIVE',?,?,0,?,?,? WHERE ${pointerGuard} AND ${runGuard}
      AND NOT EXISTS(SELECT 1 FROM collector_runs WHERE source_id=? AND started_at>?)
     ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,last_event_at=excluded.last_event_at,
     last_retrieved_at=excluded.last_retrieved_at,consecutive_failures=0,schema_version=excluded.schema_version,
     detail=excluded.detail,updated_at=excluded.updated_at
     WHERE source_health.updated_at<excluded.updated_at`)
     .bind(sourceId,eventAt,retrievedAt,schema,detail,finishedAt,...pointerValues,...runValues,sourceId,startedAt),
    // A trigger, incompatible D1 adapter, or silent no-op must not commit an
    // installed pointer without its exact evidence. CASE lazily raises a
    // deterministic SQLite JSON error only when the transaction is torn.
    db.prepare(`SELECT CASE WHEN NOT ${pointerGuard} OR (${runGuard}
      AND EXISTS(SELECT 1 FROM source_health WHERE source_id=? AND status='LIVE' AND last_event_at=?
       AND last_retrieved_at=? AND consecutive_failures=0 AND schema_version=? AND detail=? AND updated_at=?)
     ) THEN 1 ELSE json_extract('a4_unverified_primary_evidence','$') END AS verified`)
     .bind(...pointerValues,...runValues,sourceId,eventAt,retrievedAt,schema,detail,finishedAt),
   ];
  },
 });
 return publishA4Generation({terminal:input.terminal,rows},stores);
}
