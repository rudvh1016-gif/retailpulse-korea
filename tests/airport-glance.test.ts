import test from 'node:test';import assert from 'node:assert/strict';
import {glanceDestinationIncrease,glanceFutureWindow,glanceDayComparison,glanceCountryRanking,glanceFlights,glanceLongestWait,glanceUpcoming} from '../lib/airport-glance';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
const row=(day:string,id:string,airportCode='NRT',terminal='T1',gate='45'):MonthFlightRow=>({physicalFlightId:id,operatingFlight:'TEST'+id,terminal,gate,airportCode,scheduledAt:day+'T10:00:00+09:00',retrievedAt:day+'T01:00:00Z',status:'scheduled'});
test('glance reuses departure scope, collapses duplicates and includes concourse only with T1',()=>{
 const date='2026-10-11',rows=[row(date,'main'),row(date,'main'),row(date,'concourse','NRT','CONCOURSE','110'),row(date,'t2','NRT','T2','274'),{...row(date,'arrival'),direction:'arrival'}];
 const data=glanceFlights(date,rows,'T1');assert.equal(data.total,2);assert.equal(data.hours[10],2);assert.equal(data.buildings.T2.total,1);assert.equal(glanceFlights(date,rows,'all').total,3);
});
test('ranking excludes absent and zero baselines rather than inventing percentage growth',()=>{
 const current=buildAirportFlightMonth('2026-10','2026-10-11',[row('2026-10-01','a'),row('2026-10-01','b','LAX')],new Set(['2026-10-01']));
 const previous=buildAirportFlightMonth('2026-09','2026-10-11',[row('2026-09-01','a')],new Set(['2026-09-01']));
 assert.deepEqual(glanceCountryRanking(current,previous,'ALL').map(row=>row.country),['JP']);assert.equal(glanceCountryRanking(current,undefined,'ALL').length,0);
});

test('daily country shares match detailed departure grouping including unknown, duplicates and terminal scope',async()=>{
 const {departureMap}=await import('../lib/airport-departure-map');const {zoneCountries}=await import('../lib/airport-zone-countries');
 const date='2026-10-11',rows=[row(date,'a'),row(date,'a'),row(date,'b','LAX','T2','274'),row(date,'c','XXX'),row(date,'d','PUS'),{...row(date,'e','NRT'),status:'cancelled'},row(date,'f','PEK','CONCOURSE','110')];
 for(const scope of ['all','T1','T2'] as const){
 const detailed=departureMap({date,nextDate:date,window:{startMin:0,endMin:1440},rows,terminal:scope==='T2'?'T2':'T1',...(scope==='all'?{buildingScope:'all' as const}:{})});
 const counts=new Map<string|null,number>();for(const zone of zoneCountries(detailed.flights))for(const item of zone.countries)counts.set(item.country,(counts.get(item.country)??0)+item.flights);
 const actual=glanceFlights(date,rows,scope);assert.deepEqual(new Map(actual.countries.map(item=>[item.country,item.flights])),counts);assert.equal(actual.total,[...counts.values()].reduce((a,b)=>a+b,0));
 }
 assert.equal(glanceFlights(date,rows,'all').countries.find(item=>item.country===null)?.flights,1);
 assert.deepEqual(glanceFlights(date,[],'all').countries,[]);
});

test('upcoming slot uses future scheduled departures only and exposes ties without inventing passenger crowding',()=>{
 const date='2026-10-11',now=Date.parse(date+'T10:15:00+09:00'),departures=['10:00','10:30','11:00','11:45','12:00','12:30'].map(time=>({scheduledAt:date+'T'+time+':00+09:00'}));
 assert.deepEqual(glanceUpcoming(date,departures,now),{startMin:660,endMin:720,flights:2,tied:true});assert.equal(glanceUpcoming(date,departures,now+86400000),null);assert.equal(glanceUpcoming(date,[],now),null);
 assert.deepEqual(glanceUpcoming(date,departures.slice(0,2),now),{startMin:615,endMin:660,flights:1,tied:false});
});
test('longest wait reuses shared freshness and duplicate rules; closed, zero and stale are never recommendations',()=>{
 const now=Date.parse('2026-10-11T10:15:00+09:00'),row={terminal:'T1',zone:'DG2_E',waitTimeMinutes:12,waitTimeRaw:'12',observedAt:'2026-10-11T10:10:00+09:00',freshness:'LIVE'};
 assert.equal(glanceLongestWait([row],now)?.minutes,12);assert.equal(glanceLongestWait([{...row,waitTimeMinutes:0,waitTimeRaw:'0'}],now),null);
 assert.equal(glanceLongestWait([row,{...row,observedAt:'2026-10-11T10:11:00+09:00',waitTimeRaw:'closed'}],now),null);assert.equal(glanceLongestWait([row],now+21*60000),null);
 assert.equal(glanceLongestWait([{...row,terminal:'CONCOURSE'}],now),null);assert.equal(glanceLongestWait([{...row,waitTimeRaw:'60+'}],now)?.minutes,60);
});

test('whole-day comparison uses same terminal included-day mean and preserves zero/missing boundaries',()=>{
 const previous=buildAirportFlightMonth('2026-09','2026-10-11',[row('2026-09-01','a'),row('2026-09-01','b','NRT','CONCOURSE','110'),row('2026-09-02','c','NRT','T2','274')],new Set(['2026-09-01','2026-09-02']));
 assert.deepEqual(glanceDayComparison('2026-10-11',3,previous,'ALL'),{mean:1.5,delta:1.5,percent:100,days:2});
 assert.deepEqual(glanceDayComparison('2026-10-11',0,previous,'T1'),{mean:1,delta:-1,percent:-100,days:2});
 assert.deepEqual(glanceDayComparison('2026-10-11',1,previous,'T2'),{mean:.5,delta:.5,percent:100,days:2});
 for(const base of [undefined,{...previous,includedDays:[]},{...previous,month:'2026-08'}])assert.equal(glanceDayComparison('2026-10-11',3,base,'ALL'),null);
 assert.equal(glanceDayComparison('2026-10-11',3,previous,'UNKNOWN'),null);assert.equal(glanceDayComparison('2026-10-11',null,previous,'ALL'),null);
});

test('shared future window excludes elapsed/end-boundary flights, preserves unknowns and caps at midnight',()=>{
 const day='2026-10-11',at=(id:string,time:string,terminal='T1',gate='45',airportCode='NRT')=>({...row(day,id,airportCode,terminal,gate),scheduledAt:`${day}T${time}:00+09:00`});
 const data=glanceFlights(day,[at('elapsed','10:00'),at('a','10:30'),at('b','10:45','T2','274'),at('unknown','11:00','UNKNOWN','','XXX'),at('end','11:15'),at('late','23:50')],'all');
 const now=Date.parse(day+'T10:15:00+09:00'),window=glanceFutureWindow(day,data.departures,now,1)!;
 assert.equal(window.total,3);assert.equal(window.unknownBuilding,1);assert.equal(window.countries.find(row=>row.country===null)?.flights,1);assert.equal(window.leaders.length,2);assert.equal(window.leaders[0].flights,1);
 assert.equal(glanceFutureWindow(day,data.departures,now,3)?.total,4);assert.equal(glanceFutureWindow(day,[],now,1)?.total,0);assert.equal(glanceFutureWindow('2026-10-10',data.departures,now,1),null);assert.equal(glanceFutureWindow(day,data.departures,NaN,1),null);
 const late=glanceFutureWindow(day,data.departures,Date.parse(day+'T23:30:00+09:00'),6)!;assert.equal(late.total,1);assert.equal(late.clipped,true);assert.equal(late.end,Date.parse('2026-10-12T00:00:00+09:00'));
});

test('adjacent destination ranking favors absolute growth over a dominant country and preserves all ties',()=>{
 const day='2026-10-11',now=Date.parse(day+'T10:15:00+09:00');let id=0;
 const rows=(n:number,code:string,time:string)=>Array.from({length:n},()=>({...row(day,String(id++),code),scheduledAt:`${day}T${time}:00+09:00`}));
 const flights=glanceFlights(day,[...rows(10,'NRT','10:30'),...rows(10,'NRT','11:30'),...rows(1,'PEK','10:30'),...rows(4,'PEK','11:30'),...rows(3,'LAX','11:30'),...rows(2,'XXX','10:30'),...rows(5,'XXX','11:30')],'all').departures;
 const result=glanceDestinationIncrease(day,flights,now,1,true);assert.equal(result.status,'READY');if(result.status!=='READY')return;
 assert.deepEqual(result.leaders.map(r=>[r.country,r.before,r.after,r.delta]),[['CN',1,4,3],['US',0,3,3]]);assert.deepEqual(result.unknown,{before:2,after:5});assert.equal(result.rows.find(r=>r.country==='JP')?.delta,0);assert.equal('percent' in result.leaders[1],false);
});
test('adjacent destination windows honor inclusive starts and exclusive ends for 1, 3 and 6 hours',()=>{
 const day='2026-10-11',now=Date.parse(day+'T01:00:00+09:00'),base=glanceFlights(day,[row(day,'base')],'all').departures[0];
 for(const hours of [1,3,6] as const){const middle=now+hours*3600000,end=now+hours*7200000;const flights=[now-1,now,middle-1,middle,end-1,end].map((at,i)=>({...base,id:String(i),scheduledAt:new Date(at).toISOString()}));const result=glanceDestinationIncrease(day,flights,now,hours,true);assert.equal(result.status,'READY');if(result.status==='READY'){assert.equal(result.beforeTotal,2);assert.equal(result.afterTotal,2);assert.equal(result.leaders.length,0);assert.equal(result.middle-result.start,result.end-result.middle);}}
});
test('adjacent destination comparison withholds incomplete records and unequal midnight coverage',()=>{
 const day='2026-10-11',midnight=Date.parse('2026-10-12T00:00:00+09:00');
 for(const hours of [1,3,6] as const){const start=midnight-2*hours*3600000;assert.equal(glanceDestinationIncrease(day,[],start,hours,true).status,'READY');assert.equal(glanceDestinationIncrease(day,[],start+1,hours,true).status,'MIDNIGHT');}
 for(const [flights,now,ready] of [[[],midnight-7200000,false],[null,midnight-7200000,true],[[],NaN,true],[[],midnight,true]] as const)assert.equal(glanceDestinationIncrease(day,flights,now,1,ready).status,'UNAVAILABLE');
});
test('adjacent destination unknown-only and no-increase states never invent a growing country',()=>{
 const day='2026-10-11',now=Date.parse(day+'T10:00:00+09:00'),flights=glanceFlights(day,[{...row(day,'unknown','XXX'),scheduledAt:day+'T11:30:00+09:00'}],'all').departures;
 const result=glanceDestinationIncrease(day,flights,now,1,true);assert.equal(result.status,'READY');if(result.status==='READY'){assert.equal(result.leaders.length,0);assert.equal(result.rows.length,0);assert.deepEqual(result.unknown,{before:0,after:1});}
});
