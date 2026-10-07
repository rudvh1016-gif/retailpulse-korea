/** Synthetic observations for UI verification only; never production history. */
import { buildMonthlyRecords, type RecordArea, type RecordObservation, recordMonthDays } from '../lib/monthly-records';
export function recordsFixture(area: RecordArea = 'myeongdong', month = '2026-10') {
  const areaCodes = { myeongdong:'POI003',hongdae:'POI007',seongsu:'POI068',itaewon:'POI004' };
  const base = {area,areaCode:areaCodes[area],sourceId:'SEOUL_CITYDATA_PPLTN',schemaVersion:'seoul-realtime-v1',recordOrigin:'LIVE',qualityStatus:'VALID'};
  const rows: RecordObservation[]=[];
  for (const date of [...recordMonthDays('2026-08'),...recordMonthDays('2026-09'),...recordMonthDays('2026-10')]) {
    if(date>'2026-10-05' || date<'2026-08-31' || date==='2026-09-01') continue;
    const day=Number(date.slice(-2)); const min=(area==='hongdae'?52000:area==='itaewon'?12000:24000)+(date.startsWith('2026-10')?1000:100)*day;
    for(let hour=0;hour<24;hour++) {
      if((date==='2026-10-03'||date==='2026-09-02')&&hour===0) continue;
      rows.push({...base,observedAt:`${date}T${String(hour).padStart(2,'0')}:45:00+09:00`,populationMin:min,populationMax:min+2000});
    }
  }
  return buildMonthlyRecords({area,month,generatedAt:'2026-10-06T10:00:00Z',rows,first:rows[0],last:rows.at(-1)!});
}
