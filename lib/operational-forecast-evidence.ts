import { evaluateForecastPipeline, type ForecastVerdict } from './forecast-pipeline-state';
import { POPULATION_MODEL, buildPopulationHours, type PopulationSample } from './population-predictions';
import { allAreaIds } from './areas';
import { kstDayOf, shiftKstDay } from './kst';
import { sha256 } from './hash';

type ForecastRow={prediction_id:string;target_at:string;created_at:string;data_cutoff:string;source_versions:string;input_hash:string;
  record_origin:string;target_id:string;value:number;payload:string|null;actual_value:number|null;event_at:string|null;
  actual_unit:string|null;actual_target_id:string|null;source_version:string|null;quality_status:string|null;baseline:number|null};
export async function readForecastEvidence(db:D1Database,nowIso:string):Promise<ForecastVerdict[]> {
  const today=kstDayOf(nowIso), output:ForecastVerdict[]=[];
  // Seven completed days and tomorrow, at most 216 hourly rows per area.
  for(const area of allAreaIds) {
    const result=await db.prepare(`SELECT p.prediction_id,p.target_at,p.created_at,p.data_cutoff,p.source_versions,p.input_hash,p.record_origin,
      p.target_id,p.value,i.payload,o.actual_value,o.event_at,o.actual_unit,o.target_id AS actual_target_id,o.source_version,o.quality_status,b.value AS baseline
      FROM predictions p LEFT JOIN prediction_inputs i ON i.prediction_id=p.prediction_id
      LEFT JOIN outcomes o ON o.prediction_id=p.prediction_id AND o.source_id='SEOUL_CITYDATA_PPLTN' AND o.verification_level='FAST'
      LEFT JOIN baseline_predictions b ON b.prediction_id=p.prediction_id AND b.baseline_id='SAME_WEEKDAY'
      WHERE p.area=? AND p.model_version=? AND p.target_at>=? AND p.target_at<? ORDER BY p.target_at LIMIT 217`)
      .bind(area,POPULATION_MODEL,shiftKstDay(today,-7),shiftKstDay(today,2)).all<ForecastRow>();
    if(!result.results||!result.success)throw new Error('forecast_evidence_unavailable');
    if(result.results.length>216)throw new Error('forecast_evidence_cap');
    if(!result.results.length) {
      const run=await db.prepare('SELECT target_date,payload FROM forecast_runs WHERE area=? ORDER BY target_date DESC LIMIT 1').bind(area).first<{target_date:string;payload:string}>();
      output.push({targetDate:run?.target_date??today,state:run?'INPUT_MISSING':'UNKNOWN',performanceClaimAllowed:false,
        detail:`${area}: ${run?'creation window recorded but no prospective rows in inspected window':'no forecast/outcome evidence in inspected window'}`});
      continue;
    }
    const groups=new Map<string,ForecastRow[]>();
    for(const row of result.results) {const day=row.target_at.slice(0,10);groups.set(day,[...(groups.get(day)??[]),row]);}
    for(const [day,records] of groups) {
      let frozen=true,inputs=true,matched=true;
      for(const row of records) {
        let samples:PopulationSample[]=[];
        try {samples=JSON.parse(row.payload??'null');if(!Array.isArray(samples)||samples.length<2){inputs=false;continue;}}
        catch {inputs=false;continue;}
        const cutoff=Date.parse(row.data_cutoff),created=Date.parse(row.created_at),target=Date.parse(row.target_at);
        if(!Number.isFinite(cutoff)||!Number.isFinite(created)||!(cutoff<=created&&created<target)||await sha256(samples)!==row.input_hash||
          samples.some(sample=>!Number.isFinite(Date.parse(sample.retrievedAt))||Date.parse(sample.retrievedAt)>cutoff||
            !Number.isFinite(Date.parse(sample.observedAt))||Date.parse(sample.observedAt)>cutoff))frozen=false;
        let version:unknown;try{version=JSON.parse(row.source_versions).SEOUL_CITYDATA_PPLTN;}catch{frozen=false;}
        if(samples.some(sample=>sample.schemaVersion!==version))frozen=false;
        const eligible=buildPopulationHours(samples,day,row.data_cutoff).find(hour=>hour.hour===Number(row.target_at.slice(11,13)));
        if(!eligible||eligible.samples.length!==samples.length)frozen=false;
        if(row.actual_value!==null) {
          const event=Date.parse(row.event_at??'');
          if(row.source_version!==version||row.quality_status!=='VALID'||row.actual_unit!=='estimated_people_midpoint'||
            row.target_id!=='AREA_ACTIVITY'||row.actual_target_id!==row.target_id||!Number.isFinite(event)||event<target||event>=target+15*60_000||created>=event)matched=false;
        }
      }
      const actual=records.filter(row=>row.actual_value!==null);
      const verdict=evaluateForecastPipeline({targetDate:day,predictionCreated:records.every(row=>row.record_origin==='FORECAST'&&Date.parse(row.created_at)<Date.parse(row.target_at)),
        inputsPresent:inputs,inputsFrozen:frozen,outcomeWindowClosed:day<today,outcomeRecorded:actual.length===records.length,
        outcomeMatched:matched,backfillOnly:records.every(row=>row.record_origin==='BACKFILL'),matchedHours:actual.length,minimumSample:24,
        modelMeanAbsoluteError:actual.length?actual.reduce((sum,row)=>sum+Math.abs(row.value-row.actual_value!),0)/actual.length:null,
        baselineMeanAbsoluteError:actual.length&&actual.every(row=>row.baseline!==null)?actual.reduce((sum,row)=>sum+Math.abs(row.baseline!-row.actual_value!),0)/actual.length:null});
      // This model and SAME_WEEKDAY share historical inputs. Operational evidence cannot award independent skill.
      output.push({...verdict,performanceClaimAllowed:false,
        ...(verdict.state==='PIPELINE_HEALTHY'?{state:'BASELINE_NOT_INDEPENDENT' as const}:{}),
        detail:`${area}: ${verdict.detail}; same-weekday reference is not independent; monitor only`});
    }
  }
  return output;
}
