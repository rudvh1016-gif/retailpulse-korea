import {chineseText} from '../lib/chinese-ui';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import seed from '../data/airport-focus-preview/calendar-context.json';
import schools from '../data/korean-school-vacations.json';
import annual from '../data/official-calendar/priority-country-multiyear.json';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
import {calendarEventTitle,countryTrendCalendar,trendCalendarText,groupTrendCalendarItems,trendVacationAvailability} from '../lib/country-trend-calendar';
import {CountryFlag} from '../app/airport-country-flag';
import {CountryTrendCalendarContext} from '../app/country-trend-calendar-context';

const events=seed.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
const query={country:'JP',selectedMonth:'2026-09',actualDataMonths:['2026-08','2026-09'],asOf:'2026-10-21'};
const row={code:'JP',label:'일본',points:[{month:'2026-08',departures:100},{month:'2026-09',departures:110}]};
const html=(changes:Partial<Parameters<typeof CountryTrendCalendarContext>[0]>={})=>renderToStaticMarkup(createElement(CountryTrendCalendarContext,{row,events,asOf:query.asOf,...changes}));

test('Japan and Korean summer breaks retain exact dates and applicability in the default view',()=>{
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
 for(const text of ['한국 일정은 출발지 기준','증감 원인 단정 불가'])assert.ok(visible.includes(text),text);
 for(const text of ['일본 · <b>여름방학</b>','한국 · <b>여름방학</b>','<b>추석 연휴</b>'])assert.ok(visible.includes(text),text);
 assert.match(html(),/<details class="focus-source" data-testid="monthly-calendar-reference"><summary style="min-height:44px/);
 assert.ok(html().includes('일정 근거'));
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
  assert.equal(rendered.split(`<b>${item.title.split(' ').slice(1).join(' ').replace(/^공휴일 · /,'')}</b>`).length>1,true);
  assert.ok(rendered.includes(item.sourceURL));
  assert.ok(rendered.includes(`확인일 ${item.verifiedAt}`));
 }
 assert.match(rendered,/일정 근거/);
 assert.ok(rendered.includes('신주쿠 구립학교 여름방학'));
});

test('recent-event titles include country names for public and regional holidays',()=>{
 assert.equal(calendarEventTitle({country:'JP',kind:'public_holiday',name:'경로의 날'}),'일본 공휴일 · 경로의 날');
 assert.equal(calendarEventTitle({country:'US',kind:'school_break',name:'뉴욕시 공립학교 봄방학'}),'미국 봄방학');
 const source=readFileSync(new URL('../app/airport-focus-trends.tsx',import.meta.url),'utf8');
 assert.ok(source.includes('<CountryTrendCalendarContext row={row} events={events} asOf={asOf} lang={lang}/>'));
 assert.ok(source.includes('chineseText(lang,calendarCountryName(country))')&&source.includes('chineseText(lang,"최근 ")'));
 assert.ok(!source.includes('OriginCalendarContext'));
 assert.match(source,/최근 월 비교 자료가 일부 없어[^;]+<CalendarContext row=\{row\} lang=\{lang\}\/>/);
});


test('Chuseok shows the complete reviewed range without inventing missing or substitute days',()=>{
 const result=countryTrendCalendar(events,query);
 const chuseok=result.summary.find(item=>item.country==='KR'&&item.name==='추석 연휴')!;
 assert.deepEqual([chuseok.start,chuseok.end],['2026-09-24','2026-09-26']);
 assert.match(html().split('<details')[0],/추석 연휴<\/b> 2026-09-24–2026-09-26/);
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

for(const [lang,label] of Object.entries({ko:"일정 근거",en:"Comparison-period calendar · official sources",zh:"比较期间日程 · 官方依据",ja:"比較期間の日程・公式根拠"}))test(`${lang}: optional calendar control is localized`,()=>{assert.ok(html({lang:lang as "ko"|"en"|"zh"|"ja"}).includes(`>${label}</summary>`));});

test("production and preview pass the selected language to the calendar control",()=>{
 for(const file of ["app/airport-focus-production.tsx","app/airport-focus-preview.tsx"]){const source=readFileSync(file,"utf8");for(const call of source.match(/<CountryTrends\b[^>]*>/g)??[])assert.match(call,/lang=\{lang\}/,file);}
});

test('compact rows expose every matched event and keep sources in one closed list',()=>{
 const rendered=html({row:{...row,code:'US'}});
 const [visible,evidence]=rendered.split('<details');
 assert.equal((rendered.match(/<details/g)??[]).length,1);
 assert.doesNotMatch(rendered,/<details[^>]*\bopen(?:[=> ]|$)/);
 assert.match(visible,/US\.webp.*미국 · <b>노동절<\/b> 2026-09-07 · 연방공무원/);
 assert.match(visible,/kr\.svg.*한국 · <b>추석 연휴<\/b> 2026-09-24–2026-09-26/);
 assert.match(visible,/<b>여름방학<\/b> 2026-07-28–2026-08-19 · 학교별 상이 · 예시 · 직전 월/);
 assert.doesNotMatch(rendered,/2026-09-07–2026-09-07/);
 for(const name of ['노동절','추석 연휴'])assert.equal(visible.split(name).length-1,1,name);
 assert.match(visible,/한국 · <b>광복절<\/b> 2026-08-15 · 직전 월/);
 assert.match(visible,/한국 · <b>광복절 대체공휴일<\/b> 2026-08-17 · 직전 월/);
 assert.doesNotMatch(visible,/<sup>/);
 assert.match(evidence,/광복절 대체공휴일<\/b> 2026-08-17 · 직전 월/);
 assert.doesNotMatch(visible,/공식 원문|확인일|해당 기관·대상에만 적용|내리숲초등학교/);
 assert.match(evidence,/<ul>/);
 assert.match(evidence,/연방공무원 대상 · 해당 기관·대상에만 적용/);
 assert.match(evidence,/한국 일정은 한국인 여객 통계가 아닙니다/);
 assert.equal((visible.match(/<b>/g)??[]).length,countryTrendCalendar(events,{...query,country:'US'}).details.length);
 for(const country of ['JP','CN','VN','US','FR']){const compact=html({row:{...row,code:country}}).split('<details')[0];assert.equal((compact.match(/<b>/g)??[]).length,groupTrendCalendarItems(countryTrendCalendar(events,{...query,country}).details).length,country);}
 const result=countryTrendCalendar(events,{...query,country:'US'});
 assert.equal((evidence.match(/<li>/g)??[]).length,result.details.length);
 for(const item of result.details){assert.ok(evidence.includes(item.sourceURL));assert.ok(evidence.includes(item.verifiedAt));}
});

test('identical evidence is deduplicated but distinct regional/institutional schedules are retained',()=>{
 const event=events.find(item=>item.country==='JP'&&item.kind==='school_break')!;
 const result=countryTrendCalendar([event,{...event,id:'duplicate-evidence'}],query,[]);
 assert.equal(result.details.length,1);
 for(const variant of [{region:'別の自治体'},{scope:'institutional'},{name:'別の学校の夏休み'},{sourceURL:'https://example.org/different-reviewed-source'}]){
  const distinct=countryTrendCalendar([event,{...event,...variant,id:'distinct-evidence'} as CalendarEvent],query,[]);
  assert.equal(distinct.details.length,2,JSON.stringify(variant));
 }
});

test('compact institutional labels retain their full reviewed scope only in evidence',()=>{
 const federal=events.find(item=>item.country==='US'&&item.start==='2026-09-07')!;
 for(const [region,compact] of [['미국 연방공무원(관측 휴일)','연방공무원'],['방콕 금융기관 대상','금융기관'],['특정 지역 대상','특정 지역 대상']]){
  const [visible,evidence]=html({row:{...row,code:'US'},events:[{...federal,region}]}).split('<details');
  assert.ok(visible.includes(` · ${compact}`));
  assert.ok(evidence.includes(`${region} · 해당 기관·대상에만 적용`));
  if(region!==compact)assert.ok(!visible.includes(region));
 }
});


test('Japan screenshot regression: all selected and comparison-month holidays and both school examples stay visible',()=>{
 const [visible,evidence]=html().split('<details');
 for(const [country,name,dates] of [
  ['일본','경로의 날','2026-09-21'],['일본','공휴일 사이 휴일','2026-09-22'],['일본','추분의 날','2026-09-23'],
  ['일본','산의 날','2026-08-11'],['일본','여름방학','2026-07-21–2026-08-31'],
  ['한국','추석 연휴','2026-09-24–2026-09-26'],['한국','여름방학','2026-07-28–2026-08-19'],
  ['한국','광복절','2026-08-15'],['한국','광복절 대체공휴일','2026-08-17'],
 ])assert.equal(visible.split(`${country} · <b>${name}</b> ${dates}`).length-1,1,`${country} ${name}`);
 assert.equal((visible.match(/학교별 상이 · 예시/g)??[]).length,2);
 assert.doesNotMatch(visible,/공식 원문|확인일/);
 assert.match(evidence,/공식 원문/);
 assert.match(evidence,/개별 학교 예시/);
});

test('calendar flags use local images on Windows while preserving compact rows',()=>{
 for(const [country,path] of [['JP','JP.webp'],['CN','CN.webp'],['VN','VN.webp'],['US','US.webp'],['FR','fallback/fr.svg']]){
  const rendered=html({row:{...row,code:country}}).split('<details')[0];
  const contexts=countryTrendCalendar(events,{...query,country}).details;
  if(contexts.some(item=>item.country===country))assert.ok(rendered.includes('/images/airport-flags/'+path),country);
  assert.ok(rendered.includes('/images/airport-flags/fallback/kr.svg'),country);
  assert.equal((rendered.match(/<img /g)??[]).length,groupTrendCalendarItems(contexts).length+new Set(contexts.map(item=>item.country)).size);
  assert.equal((rendered.match(/width="16" height="16" alt=""/g)??[]).length,groupTrendCalendarItems(contexts).length+new Set(contexts.map(item=>item.country)).size);
  assert.doesNotMatch(rendered,/[\u{1F1E6}-\u{1F1FF}]/u);
 }
});


test('shared country flags keep existing size and never invent unknown assets',()=>{
 const standard=renderToStaticMarkup(createElement(CountryFlag,{code:'TH'}));
 assert.match(standard,/fallback\/th\.svg/);
 assert.match(standard,/width="24" height="24"/);
 for(const code of ['ZZ','OTHER','']){
  const unknown=renderToStaticMarkup(createElement(CountryFlag,{code,size:16}));
  assert.doesNotMatch(unknown,/<img|src=/);
 }
});

test('one China summer heading preserves both local schools, dates, months and official sources',()=>{
 const result=countryTrendCalendar(events,{...query,country:'CN',selectedMonth:'2026-08',actualDataMonths:['2026-07','2026-08']});
 const before=JSON.stringify(result.details),groups=groupTrendCalendarItems(result.details);
 const china=groups.filter(group=>group.country==='CN'&&group.kind==='school_break');
 assert.equal(china.length,1);assert.equal(china[0].items.length,2);
 assert.deepEqual(china[0].items.map(item=>[item.region,item.start,item.end]),[['상하이 초·중등학교','2026-07-01','2026-08-31'],['베이징 의무교육 학교','2026-07-08','2026-08-31']]);
 assert.ok(china[0].items.every(item=>item.months.length===2));assert.equal(JSON.stringify(result.details),before);
 const rendered=html({row:{...row,code:'CN',points:[{month:'2026-07',departures:100},{month:'2026-08',departures:110}]}});
 const [visible,evidence]=rendered.split('<details');
 assert.equal((visible.match(/data-vacation-group="CN"/g)??[]).length,1);
 assert.equal((visible.match(/중국 · <b>여름방학<\/b>/g)??[]).length,1);
 for(const item of china[0].items){assert.ok(visible.includes(item.region!));assert.ok(visible.includes(`${item.start}–${item.end}`));assert.ok(evidence.includes(item.sourceURL));assert.ok(evidence.includes(item.verifiedAt));}
 assert.ok(visible.includes('한국 · <b>여름방학</b>'));assert.ok(evidence.includes('개별 학교 예시'));
 assert.ok(!china[0].items.some(item=>item.scope==='national'));
});

test('same dates deduplicate only identical evidence; distinct regions, schools, sources and seasons survive grouping',()=>{
 const original=events.find(event=>event.country==='JP'&&event.kind==='school_break')!;
 const variants=[original,{...original,id:'duplicate-id'}, {...original,id:'other-school',region:'別の学校',scope:'institutional' as const}, {...original,id:'other-source',sourceURL:'https://example.test/another-reviewed-source'}];
 const details=countryTrendCalendar(variants,query,[]).details;
 const groups=groupTrendCalendarItems(details);assert.equal(details.length,3);assert.equal(groups.length,1);assert.equal(groups[0].items.length,3);
 assert.deepEqual(new Set(groups.flatMap(group=>group.items.map(item=>item.eventId))),new Set(details.map(item=>item.eventId)));
 const summer=details[0];const distinct=groupTrendCalendarItems([summer,{...summer,eventId:'spring',title:'일본 봄방학',name:'봄방학'}]);assert.equal(distinct.length,2);
});

test('Japan is preserved for actual July/August and August/September comparisons, never pulled into October',()=>{
 for(const [month,actual] of [['2026-07',['2026-07']],['2026-08',['2026-07','2026-08']],['2026-09',['2026-08','2026-09']]] as const){
  const q={...query,selectedMonth:month,actualDataMonths:actual};const result=countryTrendCalendar(events,q);
  assert.equal(trendVacationAvailability(events,q,result.details),'MATCHED');assert.ok(result.details.some(item=>item.country==='JP'&&item.kind==='school_break'),month);
 }
 const october={...query,selectedMonth:'2026-10',actualDataMonths:['2026-09','2026-10']};
 const result=countryTrendCalendar(events,october);assert.equal(trendVacationAvailability(events,october,result.details),'OUTSIDE_PERIOD');
 const rendered=html({row:{...row,points:[{month:'2026-09',departures:100},{month:'2026-10',departures:110}]}});
 assert.match(rendered,/data-school-break-status="OUTSIDE_PERIOD"/);assert.doesNotMatch(rendered,/2026-07-21|2026-08-31/);
 const noAdjacent={...query,actualDataMonths:['2026-09']};assert.equal(trendVacationAvailability(events,noAdjacent,countryTrendCalendar(events,noAdjacent).details),'OUTSIDE_PERIOD');
});

test('US spring is shown only for matching actual periods; missing countries and unverified rows never mean no vacations',()=>{
 const usa={...query,country:'US',selectedMonth:'2026-04',actualDataMonths:['2026-04']};const spring=countryTrendCalendar(events,usa);
 assert.equal(trendVacationAvailability(events,usa,spring.details),'MATCHED');assert.ok(spring.details.some(item=>item.start==='2026-04-02'&&item.end==='2026-04-10'));
 for(const country of ['VN','TH','FR']){
  const q={...query,country};assert.equal(trendVacationAvailability(events,q,countryTrendCalendar(events,q).details),'NO_REVIEWED_DATA');
  const rendered=html({row:{...row,code:country}});assert.match(rendered,/data-school-break-status="NO_REVIEWED_DATA"/);assert.match(rendered,/방학이 없다는 뜻은 아닙니다/);
 }
 for(const status of ['unverified','expired','superseded'] as const){const unverified=events.map(item=>item.kind==='school_break'?{...item,status}:item);assert.equal(trendVacationAvailability(unverified,query,countryTrendCalendar(unverified,query).details),'NO_REVIEWED_DATA');}
 assert.equal(trendVacationAvailability([],query,[]),'NO_REVIEWED_DATA');
});

for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: coverage states are localized and grouped evidence remains complete`,()=>{
 const cn=html({lang,row:{...row,code:'CN'}});assert.equal((cn.split('<details')[0].match(/data-vacation-group="CN"/g)??[]).length,1);
 for(const event of events.filter(item=>item.country==='CN'&&item.kind==='school_break')){assert.ok(cn.includes(event.sourceURL));assert.ok(cn.includes(event.start));assert.ok(cn.includes(chineseText(lang,event.region!)));}
 const vn=html({lang,row:{...row,code:'VN'}});assert.match(vn,/data-school-break-status="NO_REVIEWED_DATA"/);
 const text=vn.match(/data-school-break-status="NO_REVIEWED_DATA">([^<]+)/)?.[1]??'';
 assert.equal(text,{ko:'방학 자료: 미확인',en:'School-break data: unverified',zh:'学校假期资料：未确认',ja:'学校休暇資料：未確認'}[lang]);
 const [visible,evidence]=vn.split('<details');
 assert.doesNotMatch(visible,/data-school-break-status|data-school-break-limit/);
 assert.match(evidence,/^ class="focus-source" data-testid="monthly-calendar-reference">/);
 assert.ok(evidence.includes({ko:'방학이 없다는 뜻은 아닙니다',en:'does not mean there are no breaks',zh:'并不表示没有假期',ja:'休暇がないことを意味しません'}[lang]));
 const outside=html({lang,row:{...row,points:[{month:'2026-09',departures:100},{month:'2026-10',departures:110}]}});
 assert.doesNotMatch(outside.split('<details')[0],/data-school-break-status|data-school-break-limit/);
 assert.ok(outside.includes({ko:'방학 자료: 비교 기간 밖',en:'School-break data: outside comparison period',zh:'学校假期资料：比较期间以外',ja:'学校休暇資料：比較期間外'}[lang]));
});

test('Korean reviewed winter examples and public holidays remain independent of destination grouping',()=>{
 const q={...query,country:'KR',selectedMonth:'2027-01',actualDataMonths:['2027-01'],asOf:'2026-10-25'};
 const result=countryTrendCalendar(events,q);assert.equal(trendVacationAvailability(events,q,result.details),'MATCHED');
 assert.ok(result.details.some(item=>item.kind==='school_break'&&item.start==='2027-01-01'&&item.end==='2027-02-28'));
 const outside={...q,selectedMonth:'2026-10',actualDataMonths:['2026-09','2026-10']};
 assert.equal(trendVacationAvailability(events,outside,countryTrendCalendar(events,outside).details),'OUTSIDE_PERIOD');
 assert.ok(countryTrendCalendar(events,outside).details.some(item=>item.kind==='public_holiday'&&item.country==='KR'));
});

test('empty matched periods keep the calendar context absent instead of creating coverage-only boxes',()=>{
 const noPeriod={...row,points:[{month:'2026-05',departures:100},{month:'2026-06',departures:110}]};
 for(const country of ['JP','CN','US','VN','FR']){
  const outsideOnly=events.filter(item=>item.country===country&&item.kind==='school_break');
  for(const source of [[],outsideOnly])assert.equal(html({row:{...noPeriod,code:country},events:source}),'',`${country}: no matched event means no coverage-only UI`);
 }
});
