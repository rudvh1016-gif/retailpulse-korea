/** Copy reviewed calendar fields into the small briefing projection. No network or new facts. */
import {readFileSync,writeFileSync} from 'node:fs';
const source=JSON.parse(readFileSync('data/airport-focus-preview/holidays.json','utf8'));
const history=JSON.parse(readFileSync('data/airport-focus-preview/calendar-context.json','utf8'));
const keys=['id','country','countryLabel','name','start','end','dateLabel_ko','type','isRepresentative','conditional','scope','sourceURL','verifiedAt','reviewValidUntil','calendarScope','region'];
const current=source.events.map(event=>({...event,calendarScope:event.region?'regional':event.country==='US'?'institutional':'national',verifiedAt:event.status==='OFFICIAL_DATE_CONFIRMED'?event.checkedAt?.slice(0,10):undefined}));
const names=new Intl.DisplayNames(['ko'],{type:'region'});
// Preserve reviewed historical holidays for selected-day context; do not pull
// school/local dates into a country-wide holiday or imply annual completeness.
const historical=history.events.filter(event=>event.status==='verified'&&event.scope==='national'&&event.kind==='public_holiday'
 &&!current.some(row=>row.country===event.country&&row.start===event.start&&row.end===event.end))
 .map(event=>({...event,countryLabel:names.of(event.country),type:event.kind,calendarScope:event.scope,isRepresentative:true,conditional:false,
  scope:'전국 공휴일',dateLabel_ko:event.start===event.end?event.start:`${event.start}~${event.end}`}));
const projected={asOfKST:source.asOfKST,events:[...current,...historical].map(event=>Object.fromEntries(keys.filter(key=>Object.hasOwn(event,key)&&event[key]!==undefined).map(key=>[key,event[key]])))};
writeFileSync('data/airport-focus-preview/holidays-summary.json',JSON.stringify(projected,null,2)+'\n');
