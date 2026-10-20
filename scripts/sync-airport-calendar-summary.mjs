/** Copy reviewed calendar fields into the small briefing projection. No network or new facts. */
import {readFileSync,writeFileSync} from 'node:fs';
const source=JSON.parse(readFileSync('data/airport-focus-preview/holidays.json','utf8'));
const keys=['id','country','countryLabel','name','start','end','dateLabel_ko','type','isRepresentative','conditional','scope'];
const projected={asOfKST:source.asOfKST,events:source.events.map(event=>Object.fromEntries(keys.filter(key=>Object.hasOwn(event,key)).map(key=>[key,event[key]])))};
writeFileSync('data/airport-focus-preview/holidays-summary.json',JSON.stringify(projected,null,2)+'\n');
