import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import seed from '../data/airport-focus-preview/calendar-context.json';
import schools from '../data/korean-school-vacations.json';
import annual from '../data/official-calendar/priority-country-multiyear.json';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
import {calendarEventTitle,countryTrendCalendar,trendCalendarText} from '../lib/country-trend-calendar';
import {CountryTrendCalendarContext} from '../app/country-trend-calendar-context';

const events=seed.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
const query={country:'JP',selectedMonth:'2026-09',actualDataMonths:['2026-08','2026-09'],asOf:'2026-10-21'};
const row={code:'JP',label:'일본',points:[{month:'2026-08',departures:100},{month:'2026-09',departures:110}]};
const html=(changes:Partial<Parameters<typeof CountryTrendCalendarContext>[0]>={})=>renderToStaticMarkup(createElement(CountryTrendCalendarContext,{row,events,asOf:query.asOf,...changes}));

test('Japan and Korean summer breaks are visible separately with exact dates and applicability',()=>{
 const {summary}=countryTrendCalendar(events,query);
 assert.equal(summary.length,4);
 const japan=summary.find(item=>item.country==='JP'&&item.kind==='school_break')!;
 const korea=summary.find(item=>item.country==='KR'&&item.kind==='school_break')!;
 assert.equal(japan.title,'일본 여름방학');
 assert.equal(korea.title,'한국 여름방학');
 assert.deepEqual([japan.start,japan.end],['2026-07-21','2026-08-31']);
 assert.deepEqual([korea.start,korea.end],['2026-07-28','2026-08-19']);
 assert.match(trendCalendarText(japan),/2026-08\(직전 월\).*신주쿠 구립 유치원·초등학교·중학교·특별지원학교.*해당 지역·대상에만 적용/);
 assert.match(trendCalendarText(korea),/2026-08\(직전 월\).*초등학교 방학기간 참고.*개별 학교 예시.*한국 출발지 참고/);
 const visible=html().split('<details')[0];
 for(const text of ['일본 여름방학','한국 여름방학','일본 공휴일','한국 공휴일','한국 일정은 출발지 기준','증감 원인 단정 불가'])assert.ok(visible.includes(text),text);
});

test('Korean public holidays accompany each supported destination with selected and adjacent month labels',()=>{
 for(const country of ['JP','CN','VN','US','FR']){
  const {summary,details}=countryTrendCalendar(events,{...query,country});
  assert.ok(summary.some(item=>item.country==='KR'&&item.kind==='public_holiday'&&item.relation==='selected'),country);
  const august=details.find(item=>item.country==='KR'&&item.kind==='public_holiday'&&item.month==='2026-08')!;
  assert.match(trendCalendarText(august),/2026-08\(직전 월\) · 한국 공휴일/);
 }
});

test('other countries retain explicit country names and local scope, without inventing uncovered breaks',()=>{
 const china=countryTrendCalendar(events,{...query,country:'CN'});
 const breaks=china.details.filter(item=>item.country==='CN'&&item.kind==='school_break');
 assert.equal(breaks.length,2);
 for(const item of breaks)assert.equal(item.title,'중국 여름방학');
 assert.match(breaks.map(item=>trendCalendarText(item)).join(' '),/상하이 초·중등학교/);
 assert.match(breaks.map(item=>trendCalendarText(item)).join(' '),/베이징 의무교육 학교/);
 const usa=countryTrendCalendar(events,{...query,country:'US',selectedMonth:'2026-04',actualDataMonths:['2026-04']});
 const spring=usa.details.find(item=>item.kind==='school_break')!;
 assert.equal(spring.title,'미국 봄방학');
 assert.match(trendCalendarText(spring),/뉴욕시 공립학교 3K–12학년 대상 · 사립학교 등 제외/);
 const vietnam=countryTrendCalendar(events,{...query,country:'VN'});
 assert.ok(vietnam.summary.some(item=>item.title==='한국 여름방학'));
 assert.ok(!vietnam.details.some(item=>item.country==='VN'&&item.kind==='school_break'));
});

test('a break spanning two actual months is one event with both month relations, never duplicate paragraphs',()=>{
 const result=countryTrendCalendar(events,{...query,selectedMonth:'2026-08',actualDataMonths:['2026-07','2026-08']});
 const japan=result.details.filter(item=>item.country==='JP'&&item.kind==='school_break');
 assert.equal(japan.length,1);
 assert.deepEqual(japan[0].months.map(item=>[item.month,item.relation]),[['2026-08','selected'],['2026-07','previous']]);
 assert.match(trendCalendarText(japan[0]),/2026-08·2026-07\(직전 월\)/);
 assert.equal(new Set(result.details.map(item=>`${item.country}-${item.eventId}`)).size,result.details.length);
});

test('missing adjacent data never supplies a previous-month reason and missing current data supplies no context',()=>{
 const selectedOnly=countryTrendCalendar(events,{...query,actualDataMonths:['2026-09']});
 assert.ok(selectedOnly.details.length>0);
 assert.ok(selectedOnly.details.every(item=>item.relation==='selected'));
 assert.ok(selectedOnly.details.every(item=>item.kind!=='school_break'));
 assert.deepEqual(countryTrendCalendar(events,{...query,actualDataMonths:['2026-08']}),{summary:[],details:[]});
 assert.equal(html({row:{...row,points:[...row.points.slice(0,1),{month:'2026-09',departures:null}]}}),'');
 assert.equal(html({asOf:''}),'');
});

test('unknown, unreviewed, expired and OTHER evidence stays absent',()=>{
 for(const country of ['OTHER','unknown'])assert.deepEqual(countryTrendCalendar(events,{...query,country}),{summary:[],details:[]});
 assert.deepEqual(countryTrendCalendar([],query,[]),{summary:[],details:[]});
 assert.deepEqual(countryTrendCalendar(events,{...query,asOf:'2026-10-19'}),{summary:[],details:[]});
 const school=schools.events[0] as CalendarEvent;
 for(const changes of [{status:'unverified'},{status:'expired'},{status:'superseded'},{scope:'national'},{reviewValidUntil:'2026-10-19'}]){
  assert.deepEqual(countryTrendCalendar([],query,[{...school,...changes} as CalendarEvent]),{summary:[],details:[]});
 }
});

test('Thai financial holidays retain institutional scope rather than school or universal closure',()=>{
 const reviewed=annual.events as unknown as CalendarEvent[];
 const result=countryTrendCalendar(reviewed,{...query,country:'TH',selectedMonth:'2026-10',actualDataMonths:['2026-10']},[]);
 assert.equal(result.details.length,3);
 for(const item of result.details){
  assert.equal(item.scope,'institutional');
  assert.match(trendCalendarText(item),/금융기관/);
  assert.match(trendCalendarText(item),/해당 기관·대상에만 적용/);
  assert.doesNotMatch(trendCalendarText(item),/해당 학교에만 적용|전국/);
 }
 assert.match(trendCalendarText(result.details.find(item=>item.start==='2026-10-16')!),/방콕/);
 const federal={...reviewed.find(item=>item.country==='TH')!,id:'US-institutional-fixture',country:'US',region:'미국 연방공무원',start:'2026-10-12',end:'2026-10-12',sourceURL:'https://www.opm.gov/'};
 const us=countryTrendCalendar([federal],{...query,country:'US',selectedMonth:'2026-10',actualDataMonths:['2026-10']},[]);
 assert.match(trendCalendarText(us.details[0]),/미국 연방공무원.*해당 기관·대상에만 적용/);
 assert.doesNotMatch(trendCalendarText(us.details[0]),/해당 학교에만 적용/);
});

test('annual KR reviews are withheld from frozen previews and never extrapolate school breaks',()=>{
 const frozen=countryTrendCalendar(events,{...query,asOf:'2026-10-20'});
 assert.ok(frozen.details.every(item=>item.country!=='KR'||item.kind!=='public_holiday'));
 assert.ok(frozen.details.some(item=>item.country==='KR'&&item.kind==='school_break'));
 const nextYear=countryTrendCalendar(events,{...query,selectedMonth:'2027-09',actualDataMonths:['2027-08','2027-09']});
 assert.ok(nextYear.details.some(item=>item.country==='KR'&&item.kind==='public_holiday'));
 assert.ok(nextYear.details.every(item=>item.country==='KR'&&item.kind==='public_holiday'&&item.verifiedAt==='2026-10-21'));
});

test('source details retain official URLs and dates without repeating full visible event summaries',()=>{
 const rendered=html(),result=countryTrendCalendar(events,query);
 for(const item of result.summary){
  assert.equal(rendered.split(trendCalendarText(item,{compact:true})).length-1,1);
  assert.ok(rendered.includes(item.sourceURL));
  assert.ok(rendered.includes(`확인일 ${item.verifiedAt}`));
 }
 assert.match(rendered,/관련 일정 \d+건 더 · 공식 근거/);
 assert.ok(rendered.includes('신주쿠 구립학교 여름방학'));
});

test('recent-event titles include country names for public and regional holidays',()=>{
 assert.equal(calendarEventTitle({country:'JP',kind:'public_holiday',name:'경로의 날'}),'일본 공휴일 · 경로의 날');
 assert.equal(calendarEventTitle({country:'US',kind:'school_break',name:'뉴욕시 공립학교 봄방학'}),'미국 봄방학');
 const source=readFileSync(new URL('../app/airport-focus-trends.tsx',import.meta.url),'utf8');
 assert.ok(source.includes('<CountryTrendCalendarContext row={row} events={events} asOf={asOf}/>'));
 assert.ok(source.includes('최근 {calendarCountryName(country)} 일정'));
 assert.ok(!source.includes('OriginCalendarContext'));
 assert.match(source,/최근 월 비교 자료가 일부 없어[^;]+<CalendarContext row=\{row\}\/>/);
});


test('Chuseok shows the complete reviewed range without inventing missing or substitute days',()=>{
 const result=countryTrendCalendar(events,query);
 const chuseok=result.summary.find(item=>item.country==='KR'&&item.name==='추석 연휴')!;
 assert.deepEqual([chuseok.start,chuseok.end],['2026-09-24','2026-09-26']);
 assert.match(html().split('<details')[0],/추석 연휴 2026-09-24–2026-09-26/);
 assert.doesNotMatch(html(),/내리숲초등학교|경기 화성/);
 assert.match(html(),/초등학교 방학기간 참고 · 개별 학교 예시/);
 const incomplete=countryTrendCalendar(events.filter(item=>item.start!=='2026-09-25'),query);
 assert.equal(incomplete.summary.find(item=>item.name==='추석 연휴')!.end,'2026-09-24');
 const substitute={...events.find(item=>item.start==='2026-09-26')!,id:'substitute-fixture',name:'추석 대체공휴일',start:'2026-09-28',end:'2026-09-28'};
 assert.ok(countryTrendCalendar([...events,substitute],query).details.some(item=>item.name==='추석 대체공휴일'&&item.start==='2026-09-28'));
});


test('Chuseok grouping preserves input evidence and rejects mismatched reviews',()=>{
 const original=JSON.stringify(events);
 countryTrendCalendar(events,query);
 assert.equal(JSON.stringify(events),original);
 for(const patch of [{sourceURL:'https://www.kasa.go.kr/'},{verifiedAt:'2026-10-20'},{status:'expired'}]){
  const altered=events.map(item=>item.start==='2026-09-25'?{...item,...patch} as CalendarEvent:item);
  const item=countryTrendCalendar(altered,query).summary.find(item=>item.name==='추석 연휴')!;
  assert.equal(item.end,'2026-09-24');
 }
});
