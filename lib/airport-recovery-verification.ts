/** Production A1 verification wiring; only the existing current-day public summary. */
import { kstDayOf } from './kst';
import { airportPublicationExpectation, measureSource, readPublicSummary, verifyPublicMeasurement, type SourceMeasurement } from './operational-evidence';
import type { RecoveryVerification } from './recovery-orchestration';

const TERMINALS=['T1','T2','CONCOURSE'] as const;
const SCOPES=['total','T1','T2','CONCOURSE','other','unassigned','conflicting'] as const;
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Missing, null, invalid and real zero remain different. Never log arbitrary upstream strings. */
export function airportEvidenceField(value:unknown) {
  const kind=value===undefined?'missing':value===null?'null':typeof value;
  const safe=value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)&&value>=0||
    typeof value==='string'&&value.length<=40&&(/^\d{4}-\d{2}-\d{2}(?:T[0-9:.]+(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)||value==='live-summary'||value==='degraded');
  return {kind,value:safe?value:null,withheld:!safe&&kind!=='missing'};
}
export function airportResponseCacheEvidence(response:Response) {
  const control=response.headers.get('cache-control')??'';
  const seconds=(name:string)=>{
    const raw=control.match(new RegExp(`(?:^|,)\\s*${name}=(\\d+)(?:\\s*,|\\s*$)`,'i'))?.[1];
    return raw!==undefined&&Number.isSafeInteger(Number(raw))?Number(raw):null;
  };
  const age=response.headers.get('age'), status=response.headers.get('cf-cache-status')?.toUpperCase();
  const serverDate=Date.parse(response.headers.get('date')??'');
  return {agePresent:age!==null,ageSeconds:age!==null&&/^\d+$/.test(age)&&Number.isSafeInteger(Number(age))?Number(age):null,
    statusPresent:response.headers.has('cf-cache-status'),datePresent:response.headers.has('date'),
    status:status&&['HIT','MISS','DYNAMIC','UPDATING','EXPIRED','REVALIDATED','STALE','BYPASS','NONE'].includes(status)?status:null,
    controlPresent:response.headers.has('cache-control'),public:/(?:^|,)\s*public\s*(?:,|$)/i.test(control),
    noStore:/(?:^|,)\s*no-store\s*(?:,|$)/i.test(control),maxAgeSeconds:seconds('max-age'),
    staleWhileRevalidateSeconds:seconds('stale-while-revalidate'),serverDate:Number.isFinite(serverDate)?new Date(serverDate).toISOString():null};
}

/** Explains the existing matcher; this report never decides recovery or changes its criteria. */
export function airportPublicationDiagnostic(measured:SourceMeasurement,body:unknown) {
  const expected=airportPublicationExpectation(measured), summary=record(body), airport=record(summary.airport);
  const rawCounts=airport.departuresTrackedTodayByTerminal,counts=record(rawCounts),scope=record(airport.flightScope);
  const ownKeys=(value:unknown)=>value==null?[]:Object.keys(value as object);
  const objectBody=body!==null&&typeof body==='object'&&!Array.isArray(body);
  const comparable=!!expected&&objectBody&&summary.mode==='live-summary'&&summary.serviceDateKst===kstDayOf(measured.observedAt);
  const comparisons:Record<string,boolean|null>={
    mode:objectBody?summary.mode==='live-summary':null,
    serviceDate:objectBody?summary.serviceDateKst===kstDayOf(measured.observedAt):null,
    data:measured.dataValid,storage:measured.storageValid,
    total:expected&&comparable?airport.departuresTrackedToday===expected.total:null,
    retrievedAt:expected&&comparable?airport.departuresTrackedTodayRetrievedAt===expected.retrievedAt:null,
    terminalKeys:expected&&comparable?!!rawCounts&&ownKeys(rawCounts).length===Object.keys(expected.terminals).length:null,
    terminalCounts:expected&&comparable?!!rawCounts&&Object.entries(expected.terminals).every(([key,value])=>(rawCounts as Record<string,unknown>)[key]===value):null,
    capped:expected&&comparable?scope.capped===false:null,
  };
  for(const key of SCOPES)comparisons[`scope.${key}`]=expected&&comparable?scope[key]===expected.scope[key]:null;
  for(const key of TERMINALS)comparisons[`terminal.${key}`]=expected&&comparable&&key in expected.terminals?counts[key]===expected.terminals[key]:null;
  const projection=(total:unknown,retrievedAt:unknown,terminalValues:unknown,scopeValues:Record<string,unknown>)=>({
    total:airportEvidenceField(total),retrievedAt:airportEvidenceField(retrievedAt),
    terminals:Object.fromEntries(TERMINALS.map(key=>[key,airportEvidenceField(record(terminalValues)[key])])),
    terminalContainerKind:terminalValues===undefined?'missing':terminalValues===null?'null':Array.isArray(terminalValues)?'array':typeof terminalValues,
    terminalKeyCount:ownKeys(terminalValues).length,
    otherTerminalKeyCount:ownKeys(terminalValues).filter(key=>!TERMINALS.includes(key as typeof TERMINALS[number])).length,
    scope:Object.fromEntries([...SCOPES,'capped'].map(key=>[key,airportEvidenceField(scopeValues[key])])),
  });
  const notApplicable=expected?TERMINALS.filter(key=>!(key in expected.terminals)).map(key=>`terminal.${key}`):[];
  return {sampleRows:measured.sample.length,sampleCap:2000,coverage:measured.coverage,
    collector:{status:['SUCCESS','ERROR','NEEDS_KEY','PARTIAL','SKIPPED_ALREADY_COMPLETE_TODAY'].includes(String(measured.run?.status))?String(measured.run?.status):null,
      startedAt:airportEvidenceField(measured.run?.started_at),finishedAt:airportEvidenceField(measured.run?.finished_at)},
    sourceHealth:{status:['LIVE','STALE','ERROR','MISSING','DEGRADED','OFFICIAL_HISTORICAL'].includes(String(measured.health?.status))?String(measured.health?.status):null,
      lastRetrievedAt:airportEvidenceField(measured.health?.last_retrieved_at)},
    verification:{dataValid:measured.dataValid,storageValid:measured.storageValid,publicValid:measured.publicValid},
    comparisons,mismatches:Object.keys(comparisons).filter(key=>comparisons[key]===false),
    notApplicable,unmeasured:Object.keys(comparisons).filter(key=>comparisons[key]===null&&!notApplicable.includes(key)),
    expected:expected?projection(expected.total,expected.retrievedAt,expected.terminals,{...expected.scope,capped:false}):null,
    publicBodyKind:body===undefined?'not-read':body===null?'null':Array.isArray(body)?'array':typeof body,
    published:!objectBody?null:{mode:airportEvidenceField(summary.mode),serviceDate:airportEvidenceField(summary.serviceDateKst),
      generatedAt:airportEvidenceField(summary.generatedAt),...projection(airport.departuresTrackedToday,airport.departuresTrackedTodayRetrievedAt,rawCounts,scope)}};
}

/** SELECTs + the SAME one current-day public GET. No provider, write, retry, bypass or wait. */
export async function inspectAirportRecoveryToday(db:D1Database,targetDate:string,nowIso:string,
  fetchImpl:typeof fetch=fetch,onEvidence:(evidence:unknown)=>void=()=>{}) {
  const emit=(value:unknown)=>{try{onEvidence(value);}catch{/* diagnostic transport cannot alter verification */}};
  if(targetDate!==kstDayOf(nowIso)) {
    const verification:RecoveryVerification={dataValid:false,storageValid:false,publicValid:null};
    const evidence={sourceId:'INCHEON_FLIGHT_DETAIL',checkedAt:airportEvidenceField(nowIso),targetDate:airportEvidenceField(targetDate),
      reason:'TARGET_DATE_MISMATCH',verification,publicRequest:{attempted:false,status:null}};
    emit(evidence);return {verification,evidence};
  }
  let measured:SourceMeasurement|undefined,body:unknown;
  let stage='measurement',attempted=false,status:number|null=null,cache:ReturnType<typeof airportResponseCacheEvidence>|null=null;
  try {
    measured=await measureSource(db,'INCHEON_FLIGHT_DETAIL',nowIso,{airportRecovery:true});
    if(measured.dataValid===true&&measured.storageValid===true) {
      stage='public_read';attempted=true;
      body=await readPublicSummary(async(input,init)=>{
        const response=await fetchImpl(input,init);status=response.status;cache=airportResponseCacheEvidence(response);return response;
      });
      stage='comparison';verifyPublicMeasurement(measured,{today:body,tomorrow:null});
    }
    const verification:RecoveryVerification={dataValid:measured.dataValid,storageValid:measured.storageValid,publicValid:measured.publicValid};
    const evidence={sourceId:'INCHEON_FLIGHT_DETAIL',checkedAt:airportEvidenceField(nowIso),targetDate:airportEvidenceField(targetDate),
      stage:'complete',publicRequest:{attempted,status,cache},...airportPublicationDiagnostic(measured,body)};
    emit(evidence);return {verification,evidence};
  } catch(error) {
    emit({sourceId:'INCHEON_FLIGHT_DETAIL',checkedAt:airportEvidenceField(nowIso),targetDate:airportEvidenceField(targetDate),
      stage,error:'READ_OR_COMPARISON_UNAVAILABLE',publicRequest:{attempted,status,cache},
      ...(measured?airportPublicationDiagnostic(measured,body):{})});
    throw error; // Preserve existing failure handling; no error text/URL is logged here.
  }
}

export async function verifyAirportRecoveryToday(db:D1Database,targetDate:string,nowIso:string,
  fetchImpl:typeof fetch=fetch):Promise<RecoveryVerification> {
  return (await inspectAirportRecoveryToday(db,targetDate,nowIso,fetchImpl,
    evidence=>console.log(JSON.stringify({airportRecoveryVerification:evidence})))).verification;
}
