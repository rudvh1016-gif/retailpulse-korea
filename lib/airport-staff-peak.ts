/** Selected-day scheduled departure concentration, never passenger or shop demand. */
export function staffDeparturePeak(day:string,flights:readonly {scheduledAt:string;building:string}[]|null){
 const start=Date.parse(`${day}T00:00:00+09:00`);
 if(!flights||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(start))return null;
 const bins=Array.from({length:24},()=>[] as typeof flights[number][]);
 for(const row of flights){const hour=Math.floor((Date.parse(row.scheduledAt)-start)/3_600_000);if(hour>=0&&hour<24)bins[hour].push(row);}
 const maximum=Math.max(...bins.map(rows=>rows.length));if(!maximum)return null;
 const hour=bins.findIndex(rows=>rows.length===maximum),rows=bins[hour],counts=new Map<string,number>();
 for(const row of rows)counts.set(row.building,(counts.get(row.building)??0)+1);
 const unknown=counts.get('UNKNOWN')??0;
 const known=[...counts].filter(([building])=>['T1','T2','CONCOURSE'].includes(building));
 const top=Math.max(0,...known.map(([,count])=>count));
 // Unknown building assignments make a definitive terminal winner unsafe.
 const leaders=unknown===0?known.filter(([,count])=>count===top).map(([building,count])=>({building,count})):[];
 return {hour,endHour:hour+1,flights:maximum,tiedHours:bins.filter(rows=>rows.length===maximum).length,leaders,unknown};
}
export type StaffDeparturePeak=ReturnType<typeof staffDeparturePeak>;
