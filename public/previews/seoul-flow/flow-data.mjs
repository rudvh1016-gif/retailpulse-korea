// Adapter for the existing /api/live/summary payload. No collection or schedule here.
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
export function fromSummary(summary,area='itaewon',publication={}) {
 const block=summary?.areas?.[area]??{};
 const subway=block.subwayRidership;
 const presence=block.foreignPresence;
 const mobility=block.foreignPurposeMobility;
 // Publication metadata is separate from the data reference date. Never derive one from the other.
 const releaseMonth=typeof publication.releaseMonth==='string'&&/^\d{4}-\d{2}$/.test(publication.releaseMonth)?publication.releaseMonth:null;
 return {
  kind:'CONNECTED_SUMMARY_VIEW',notLive:true,district:area,generatedAt:summary?.generatedAt??null,
  station:subway?{stationName:subway.selectedStations??null,referenceDate:day(subway.referenceDate),boardingCount:finite(subway.boardingCount),alightingCount:finite(subway.alightingCount),selectedStationCount:subway.selectedStationCount??null,unit:'people',provider:subway.datasetId??null,retrievedAt:subway.retrievedAt??null,aggregation:'DAILY'}:null,
  foreignLivingPopulation:presence?.qualityStatus==='VALID'?{value:finite(presence.value),unit:'people_estimate',referenceAt:presence.referenceAt??null,provider:presence.productVersion??null,retrievedAt:presence.retrievedAt??null,aggregation:'HOURLY_REFERENCE'}:null,
  tourismPurposeMovement:mobility?{value:finite(mobility.tourism),referenceDate:day(mobility.referenceDate),releaseMonth,originalUnit:null,unitVerified:false,provider:mobility.datasetId??null,retrievedAt:mobility.retrievedAt??null,aggregation:'OFFICIAL_BATCH_FILE'}:null
 };
}
export async function readExistingSummary({area='itaewon',date,signal,endpoint='/api/live/summary'}={}) {
 const url=new URL(endpoint,window.location.origin);
 if(url.origin!==window.location.origin)throw new Error('summary_must_use_same_origin');
 if(day(date))url.searchParams.set('date',date);
 const response=await fetch(url,{signal,headers:{accept:'application/json'}});
 if(!response.ok)throw new Error('summary_http_'+response.status);
 return fromSummary(await response.json(),area);
}