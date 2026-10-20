import {mainBuildingMonth} from '../lib/airport-monthly-building';
import test from 'node:test';import assert from 'node:assert/strict';
import {dailyChangeText,glanceComparableCountries,glanceCountryDeclines,glanceDestinationIncrease,glanceFutureWindow,glanceDayComparison,glanceCountryRanking,glanceFlights,glanceLongestWait,glanceUpcoming,sameDailyChange} from '../lib/airport-glance';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
const row=(day:string,id:string,airportCode='NRT',terminal='T1',gate='45'):MonthFlightRow=>({physicalFlightId:id,operatingFlight:'TEST'+id,terminal,gate,airportCode,scheduledAt:day+'T10:00:00+09:00',retrievedAt:day+'T01:00:00Z',status:'scheduled'});
test('glance reuses physical building scope and keeps T1 main separate from concourse',()=>{
 const date='2026-10-11',rows=[row(date,'main'),row(date,'main'),row(date,'concourse','NRT','CONCOURSE','110'),row(date,'t2','NRT','T2','274'),{...row(date,'arrival'),direction:'arrival'}];
 const data=glanceFlights(date,rows,'T1');assert.equal(data.total,1);assert.equal(data.hours[10],1);assert.equal(glanceFlights(date,rows,'CONCOURSE').total,1);assert.equal(data.buildings.T2.total,1);assert.equal(glanceFlights(date,rows,'all').total,3);
});
// Owner, 2026-10-14: "전월비일편균증감률말고 증감건수로 표기하고 순위도 증감건수로하자" and
// "이것처럼 전월비 일평균 감소 탑5도 넣자" — rank by the change in daily-mean flights, increases and
// decreases in separate lists. A destination new this month (mean 0 last month) is a real +N, one
// gone this month a real decrease; no change is in neither list; an incomparable month yields nothing.
test('increase and decrease lists order by daily-mean change in flights, each in its own direction',()=>{
 const current=buildAirportFlightMonth('2026-10','2026-10-11',[row('2026-10-01','a'),row('2026-10-01','b','LAX')],new Set(['2026-10-01']));
 const previous=buildAirportFlightMonth('2026-09','2026-10-11',[row('2026-09-01','a'),row('2026-09-01','c','PEK'),row('2026-09-01','d','PEK')],new Set(['2026-09-01']));
 assert.deepEqual(glanceCountryRanking(current,previous,'ALL').map(row=>[row.country,row.previous,row.current,row.delta]),[['US',0,1,1]]);
 assert.deepEqual(glanceCountryDeclines(current,previous,'ALL').map(row=>[row.country,row.previous,row.current,row.delta]),[['CN',2,0,-2]]);
 assert.equal(glanceComparableCountries(current,previous,'ALL'),3,'JP is comparable but unchanged, in neither list');
 assert.equal(glanceCountryRanking(current,undefined,'ALL').length,0);assert.equal(glanceCountryDeclines(current,undefined,'ALL').length,0);assert.equal(glanceComparableCountries(current,undefined,'ALL'),0);
});
test('the decrease list puts the largest fall first and caps at five',()=>{
 const flights=(month:string,code:string,n:number)=>Array.from({length:n},(_,i)=>row(month+'-01',code+month+i,code));
 const codes=['NRT','LAX','PEK','BKK','CDG','FRA'];
 const current=buildAirportFlightMonth('2026-10','2026-10-11',codes.flatMap(code=>flights('2026-10',code,1)),new Set(['2026-10-01']));
 const previous=buildAirportFlightMonth('2026-09','2026-10-11',codes.flatMap((code,index)=>flights('2026-09',code,index+2)),new Set(['2026-09-01']));
 assert.deepEqual(glanceCountryDeclines(current,previous,'ALL').map(row=>[row.country,row.delta]),[['DE',-6],['FR',-5],['TH',-4],['CN',-3],['US',-2]]);
 assert.equal(glanceCountryRanking(current,previous,'ALL').length,0);
});
test('a larger flight-count increase outranks a larger percentage on a small base',()=>{
 // JP 1 → 2 per day is +100% but +1; US 10 → 13 per day is +30% but +3.
 const flights=(month:string,code:string,n:number)=>Array.from({length:n},(_,i)=>row(month+'-01',code+month+i,code));
 const current=buildAirportFlightMonth('2026-10','2026-10-11',[...flights('2026-10','NRT',2),...flights('2026-10','LAX',13)],new Set(['2026-10-01']));
 const previous=buildAirportFlightMonth('2026-09','2026-10-11',[...flights('2026-09','NRT',1),...flights('2026-09','LAX',10)],new Set(['2026-09-01']));
 assert.deepEqual(glanceCountryRanking(current,previous,'ALL').map(row=>[row.country,row.delta]),[['US',3],['JP',1]]);
});
test('daily change text keeps the page convention and a direction below the printed precision',()=>{
 const format=new Intl.NumberFormat('ko',{maximumFractionDigits:1}).format;
 assert.equal(dailyChangeText(2.1,format),'▲ +2.1');assert.equal(dailyChangeText(-0.3,format),'▽ −0.3');assert.equal(dailyChangeText(0,format),'0');
 assert.equal(dailyChangeText(0.04,format),'▲ +<0.1');assert.equal(dailyChangeText(-0.04,format),'▽ −<0.1');assert.equal(dailyChangeText(12,format),'▲ +12');
 assert.equal(sameDailyChange(2.14,2.06),true);assert.equal(sameDailyChange(2.14,2.26),false);
});

test('daily country shares match detailed departure grouping including unknown, duplicates and terminal scope',async()=>{
 const {departureMap}=await import('../lib/airport-departure-map');const {zoneCountries}=await import('../lib/airport-zone-countries');
 const date='2026-10-11',rows=[row(date,'a'),row(date,'a'),row(date,'b','LAX','T2','274'),row(date,'c','XXX'),row(date,'d','PUS'),{...row(date,'e','NRT'),status:'cancelled'},row(date,'f','PEK','CONCOURSE','110')];
 for(const scope of ['all','T1','CONCOURSE','T2'] as const){
 const detailed=departureMap({date,nextDate:date,window:{startMin:0,endMin:1440},rows,terminal:scope==='T2'?'T2':'T1',buildingScope:scope});
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

test('representative zone context uses selected-scope denominator and exact zone/window destinations',()=>{
 const day='2026-10-11',now=Date.parse(day+'T10:15:00+09:00'),template=glanceFlights(day,[row(day,'base')],'all').departures[0];let id=0;
 const group=(n:number,building:typeof template.building,side:typeof template.side,country:string|null,time='10:30')=>Array.from({length:n},()=>({...template,id:String(id++),building,side,destination:country?{...template.destination!,country}:null,scheduledAt:`${day}T${time}:00+09:00`}));
 const flights=[...group(4,'T2','WEST','JP'),...group(2,'T2','WEST','CN'),...group(1,'T2','WEST',null),...group(3,'T2','EAST','US'),...group(1,'T2','CENTER','VN'),...group(5,'T1','EAST','US'),...group(1,'UNKNOWN','UNVERIFIED',null),...group(9,'T2','WEST','US','09:30')];
 const all=glanceFutureWindow(day,flights,now,1)!;assert.equal(all.total,17);assert.equal(all.leaders.length,1);assert.equal(all.leaders[0].flights,7);assert.equal(all.leaders[0].share,7/17*100);assert.deepEqual(all.leaders[0].countries,[{country:'JP',flights:4},{country:'CN',flights:2},{country:null,flights:1}]);assert.equal(all.buildings.T2.EAST,3);assert.equal(all.buildings.T2.CENTER,1);
 const t2=glanceFutureWindow(day,flights.filter(f=>f.building==='T2'),now,1)!;assert.equal(t2.leaders[0].share,7/11*100);
 const tied=glanceFutureWindow(day,[...flights,...group(2,'T1','EAST','CN')],now,1)!;assert.deepEqual(tied.leaders.map(row=>[row.building,row.side,row.flights]),[['T1','EAST',7],['T2','WEST',7]]);assert.equal(tied.leaders[0].countries.find(row=>row.country==='US')?.flights,5);
});

test('glance building month reuses PR347 projection for day means and country rankings without mutating source',()=>{
 const make=(month:string,main:number,concourse:number)=>buildAirportFlightMonth(month,'2026-10-11',[...Array.from({length:main},(_,i)=>row(month+'-01','main'+i,'NRT')),...Array.from({length:concourse},(_,i)=>row(month+'-01','con'+i,'PEK','CONCOURSE','110'))],new Set([month+'-01']));
 const current=make('2026-10',3,4),previous=make('2026-09',1,2),original=JSON.stringify([current,previous]),main=mainBuildingMonth(current)!,before=mainBuildingMonth(previous)!;
 assert.equal(main.scopes.T1.total,3);assert.equal(current.scopes.T1.total,7);assert.equal(current.scopes.CONCOURSE.total,4);
 assert.deepEqual(glanceCountryRanking(main,before,'T1').map(r=>[r.country,r.current,r.previous,r.delta]),[['JP',3,1,2]]);assert.deepEqual(glanceCountryRanking(current,previous,'CONCOURSE').map(r=>[r.country,r.current,r.previous,r.delta]),[['CN',4,2,2]]);
 assert.deepEqual(glanceDayComparison('2026-10-11',5,before,'T1'),{mean:1,delta:4,percent:400,days:1});assert.deepEqual(glanceDayComparison('2026-10-11',7,previous,'CONCOURSE'),{mean:2,delta:5,percent:250,days:1});assert.equal(JSON.stringify([current,previous]),original);
});
test('glance building month rejects absent or inconsistent concourse projection rather than inventing zero',()=>{
 const previous=buildAirportFlightMonth('2026-09','2026-10-11',[row('2026-09-01','a')],new Set(['2026-09-01']));const broken=structuredClone(previous);broken.scopes.CONCOURSE.total=2;assert.equal(mainBuildingMonth(broken),undefined);assert.equal(glanceDayComparison('2026-10-11',5,mainBuildingMonth(broken),'T1'),null);
 const missing=structuredClone(previous);delete (missing.scopes as Partial<typeof missing.scopes>).CONCOURSE;assert.equal(mainBuildingMonth(missing),undefined);assert.equal(mainBuildingMonth(undefined),undefined);
});

