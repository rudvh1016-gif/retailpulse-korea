import { allAreaIds, type AreaId } from './areas';
import { kstDayOf, shiftKstDay } from './kst';
import { createImmutablePrediction } from './forecast';
import { sha256 } from './hash';
import { runD1Batches } from './d1-write-counts';

export const POPULATION_MODEL = 'weekday-hour-start-v1';
export interface PopulationSample {
  observedAt:string; retrievedAt:string; populationMin:number; populationMax:number;
  sourceHash:string; qualityStatus:string; recordOrigin:string; schemaVersion:string;
}
export interface PopulationHour {
  hour:number; value:number; samples:PopulationSample[];
}
/** First valid observation within minute 00..14 of each hour; same definition for outcome. */
export function chooseHourSample(rows:PopulationSample[], day:string, hour:number, cutoff:string):PopulationSample|null {
  return rows.filter(row => row.observedAt.startsWith(`${day}T${String(hour).padStart(2,'0')}:`)
    && Number(row.observedAt.slice(14,16)) < 15 && row.qualityStatus === 'VALID' && row.recordOrigin === 'LIVE'
    && Number.isFinite(Date.parse(row.retrievedAt)) && Date.parse(row.retrievedAt) <= Date.parse(cutoff)
    && Number.isFinite(row.populationMin) && Number.isFinite(row.populationMax)
    && row.populationMin >= 0 && row.populationMax >= row.populationMin)
    .sort((a,b)=>a.observedAt.localeCompare(b.observedAt))[0] ?? null;
}
export function buildPopulationHours(rows:PopulationSample[],targetDate:string,cutoff:string):PopulationHour[] {
  const output:PopulationHour[]=[];
  for(let hour=0;hour<24;hour++) {
    const samples=[7,14,21,28].map(days=>chooseHourSample(rows,shiftKstDay(targetDate,-days),hour,cutoff)).filter((row):row is PopulationSample=>!!row);
    // Require two distinct same-weekday dates; mixing definitions is forbidden.
    if(samples.length<2 || new Set(samples.map(s=>s.schemaVersion)).size!==1) continue;
    output.push({hour,value:Math.round(samples.reduce((sum,row)=>sum+(row.populationMin+row.populationMax)/2,0)/samples.length),samples});
  }
  return output;
}
export const POPULATION_ROWS_SQL = `SELECT observed_at AS observedAt,retrieved_at AS retrievedAt,
 population_min AS populationMin,population_max AS populationMax,source_hash AS sourceHash,
 quality_status AS qualityStatus,record_origin AS recordOrigin,schema_version AS schemaVersion
 FROM seoul_realtime_area WHERE area=? AND source_id='SEOUL_CITYDATA_PPLTN' AND quality_status='VALID' AND record_origin='LIVE' AND observed_at>=? AND observed_at<? ORDER BY observed_at LIMIT 10001`;

/** Runs in existing Actions, once per area/target day from 18:00 KST. Never on a page request. */
export async function runPopulationPredictions(db:D1Database,now=new Date()) {
  const today=kstDayOf(now.toISOString()), targetDate=shiftKstDay(today,1), cutoff=now.toISOString();
  await updatePopulationCoverage(db,now);
  const hour=(now.getUTCHours()+9)%24;
  if(hour<18) return {status:'WAITING_FOR_18_KST',predictions:0};
  let count=0;
  for(const area of allAreaIds) {
    if(await db.prepare('SELECT 1 FROM forecast_runs WHERE area=? AND target_date=?').bind(area,targetDate).first()) continue;
    const rows=(await db.prepare(POPULATION_ROWS_SQL).bind(area,shiftKstDay(targetDate,-28),targetDate).all<PopulationSample>()).results ?? [];
    const latest=rows.at(-1);
    // Do not close today's creation window on an outage; next realtime run can retry.
    if(!latest || now.getTime()-Date.parse(latest.observedAt)>2*3600000) continue;
    const capped=rows.length>10000;
    const hours=capped?[]:buildPopulationHours(rows,targetDate,cutoff);
    const statements:D1PreparedStatement[]=[];
    for(const forecast of hours) {
      const targetAt=`${targetDate}T${String(forecast.hour).padStart(2,'0')}:00:00+09:00`;
      const id=`${POPULATION_MODEL}:${area}:${targetAt}`;
      const features=forecast.samples.map(row=>({sourceId:'SEOUL_CITYDATA_PPLTN',eventAt:row.observedAt,
        availableAt:row.retrievedAt,ingestionAt:row.retrievedAt,value:(row.populationMin+row.populationMax)/2,recordOrigin:'LIVE' as const}));
      const inputHash=await sha256(forecast.samples);
      const prediction=await createImmutablePrediction({predictionId:id,createdAt:cutoff,targetAt,dataCutoff:cutoff,
        targetId:'AREA_ACTIVITY',area:area as AreaId,value:forecast.value,forecastClass:'MODERATE',confidence:'LOW',
        modelVersion:POPULATION_MODEL,proxyVersion:'population-midpoint-people-v1',featureVersion:'same-weekday-00-14min-v1',
        sourceVersions:{SEOUL_CITYDATA_PPLTN:forecast.samples[0].schemaVersion},inputHash,recordOrigin:'FORECAST'},features);
      statements.push(db.prepare(`INSERT INTO predictions(prediction_id,created_at,target_at,data_cutoff,target_id,area,
        value,value_scale,forecast_class,confidence,model_version,proxy_version,feature_version,source_versions,input_hash,prediction_hash,record_origin)
        VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?) ON CONFLICT(prediction_id) DO NOTHING`).bind(id,cutoff,targetAt,cutoff,'AREA_ACTIVITY',area,
        forecast.value,'MODERATE','LOW',POPULATION_MODEL,prediction.proxyVersion,prediction.featureVersion,JSON.stringify(prediction.sourceVersions),inputHash,prediction.predictionHash,'FORECAST'));
      statements.push(db.prepare('INSERT INTO prediction_inputs(prediction_id,payload) SELECT ?,? WHERE EXISTS(SELECT 1 FROM predictions WHERE prediction_id=? AND input_hash=?) ON CONFLICT DO NOTHING').bind(id,JSON.stringify(forecast.samples),id,inputHash));
      const last=forecast.samples.find(row=>row.observedAt.startsWith(shiftKstDay(targetDate,-7)));
      if(last) statements.push(db.prepare(`INSERT INTO baseline_predictions(id,prediction_id,baseline_id,value,value_scale,created_at) SELECT ?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM predictions WHERE prediction_id=? AND input_hash=?) ON CONFLICT DO NOTHING`)
        .bind(`${id}:last-week`,id,'SAME_WEEKDAY',Math.round((last.populationMin+last.populationMax)/2),cutoff,id,inputHash));
    }
    if(statements.length) await runD1Batches(db,statements);
    const saved=(await db.prepare(`SELECT p.target_at AS targetAt,p.value,i.payload FROM predictions p JOIN prediction_inputs i ON i.prediction_id=p.prediction_id
      WHERE p.area=? AND p.model_version=? AND p.target_at>=? AND p.target_at<? ORDER BY p.target_at LIMIT 24`)
      .bind(area,POPULATION_MODEL,targetDate,shiftKstDay(targetDate,1)).all<{targetAt:string;value:number;payload:string}>()).results??[];
    const savedHours=saved.map(row=>({hour:Number(row.targetAt.slice(11,13)),value:row.value,
      sampleDates:(JSON.parse(row.payload) as PopulationSample[]).map(s=>s.observedAt.slice(0,10))}));
    const dates=[...new Set(rows.filter(row=>row.qualityStatus==='VALID'&&row.recordOrigin==='LIVE').map(row=>row.observedAt.slice(0,10)))];
    const payload={status:savedHours.length?'PRELIMINARY':'COLLECTING',targetDate,createdAt:cutoff,
      hours:savedHours,
      history:{firstDate:dates[0]??null,lastDate:dates.at(-1)??null,days:dates.length,expectedDays:28,
        missingDays:Array.from({length:28},(_,i)=>shiftKstDay(targetDate,-28+i)).filter(day=>!dates.includes(day)),capped},
      modelVersion:POPULATION_MODEL};
    await db.prepare('INSERT INTO forecast_runs(area,target_date,created_at,payload) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(area,targetDate,cutoff,JSON.stringify(payload)).run();
    count+=hours.length;
  }
  if(await db.prepare('SELECT 1 FROM forecast_maintenance WHERE day=?').bind(today).first()) return {status:'SUCCESS',predictions:count};
  await matchPopulationOutcomes(db,now);
  // New compact context history is limited to 90 days, with bounded daily work.
  await db.prepare('DELETE FROM seoul_context WHERE (area,observed_at) IN (SELECT area,observed_at FROM seoul_context WHERE observed_at<? LIMIT 400)')
    .bind(shiftKstDay(today,-90)).run();
  await db.prepare('INSERT INTO forecast_maintenance(day,completed_at) VALUES(?,?) ON CONFLICT DO NOTHING').bind(today,cutoff).run();
  return {status:'SUCCESS',predictions:count};
}
export async function matchPopulationOutcomes(db:D1Database,now=new Date()) {
  const rows=(await db.prepare(`SELECT p.prediction_id AS id,p.area,p.target_at AS targetAt,p.created_at AS createdAt,p.source_versions AS sourceVersions
    FROM predictions p LEFT JOIN outcomes o ON o.prediction_id=p.prediction_id
    WHERE p.model_version=? AND p.target_at>=? AND p.target_at<? AND o.id IS NULL LIMIT 600`)
    .bind(POPULATION_MODEL,shiftKstDay(kstDayOf(now.toISOString()),-7),kstDayOf(now.toISOString())).all<{id:string;area:string;targetAt:string;createdAt:string;sourceVersions:string}>()).results ?? [];
  for(const prediction of rows) {
    const day=prediction.targetAt.slice(0,10),hour=Number(prediction.targetAt.slice(11,13));
    const samples=(await db.prepare(POPULATION_ROWS_SQL).bind(prediction.area,prediction.targetAt,`${day}T${String(hour).padStart(2,'0')}:15:00+09:00`).all<PopulationSample>()).results ?? [];
    const actual=chooseHourSample(samples,day,hour,now.toISOString());
    if(!actual || Date.parse(prediction.createdAt)>=Date.parse(actual.observedAt) || actual.schemaVersion!==JSON.parse(prediction.sourceVersions).SEOUL_CITYDATA_PPLTN) continue;
    await db.prepare(`INSERT INTO outcomes(id,prediction_id,target_id,event_at,available_at,collected_at,actual_value,
      actual_unit,source_id,source_version,verification_level,quality_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
      .bind(`${prediction.id}:population`,prediction.id,'AREA_ACTIVITY',actual.observedAt,actual.retrievedAt,now.toISOString(),
        Math.round((actual.populationMin+actual.populationMax)/2),'estimated_people_midpoint','SEOUL_CITYDATA_PPLTN',actual.schemaVersion,'FAST','VALID').run();
  }
}

/** Hourly bounded history accounting in Actions, never on a visitor request. */
export async function updatePopulationCoverage(db:D1Database,now=new Date()) {
 const today=kstDayOf(now.toISOString()),tomorrow=shiftKstDay(today,1);
 for(const area of allAreaIds) {
  const cached=await db.prepare('SELECT calculated_at FROM area_data_coverage WHERE area=?').bind(area).first<{calculated_at:string}>();
  if(cached&&Date.parse(cached.calculated_at)>now.getTime()-50*60000)continue;
  const rows=(await db.prepare(`SELECT substr(observed_at,1,10) AS day,MIN(observed_at) AS firstAt,MAX(observed_at) AS latestAt,
    COUNT(DISTINCT substr(observed_at,12,2)) AS hours FROM seoul_realtime_area
    WHERE area=? AND source_id='SEOUL_CITYDATA_PPLTN' AND observed_at>=? AND observed_at<? AND quality_status='VALID' AND record_origin='LIVE'
    GROUP BY substr(observed_at,1,10) ORDER BY day`).bind(area,shiftKstDay(tomorrow,-28),tomorrow)
    .all<{day:string;firstAt:string;latestAt:string;hours:number}>()).results??[];
  const payload={days:rows.length,firstAt:rows[0]?.firstAt??null,latestAt:rows.at(-1)?.latestAt??null,
    missingDays:Array.from({length:28},(_,i)=>shiftKstDay(tomorrow,-28+i)).filter(day=>!rows.some(row=>row.day===day)),
    dailyHours:rows.map(row=>({day:row.day,hours:row.hours})),calculatedAt:now.toISOString()};
  await db.prepare(`INSERT INTO area_data_coverage(area,calculated_at,payload) VALUES(?,?,?) ON CONFLICT(area) DO UPDATE SET
    calculated_at=excluded.calculated_at,payload=excluded.payload`).bind(area,now.toISOString(),JSON.stringify(payload)).run();
 }
}
