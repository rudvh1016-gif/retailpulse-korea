import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const glance=read('../app/airport-glance-preview.tsx');
const briefing=read('../app/airport-staff-briefing.tsx');
const styles=read('../app/airport-staff-briefing.css');

test('one airport-flow heading groups the original metrics followed immediately by the staff briefing',()=>{
 assert.equal((glance.match(/>주목할 공항 흐름<\/h2>/g)??[]).length,1);
 assert.doesNotMatch(glance,/오늘 업무에서 먼저 확인|선택일 업무 지표/);
 assert.match(glance,/<section className="glance-insights"[^>]+aria-labelledby=\{overviewHeading\?'airport-staff-briefing-title':undefined\}/);
 assert.match(glance,/<h2 id="airport-staff-briefing-title" className="glance-workday-heading">주목할 공항 흐름<\/h2>/);
 const markers=['id="airport-staff-briefing-title"','data-testid="glance-key-wait"','data-testid="glance-key-upcoming"','data-testid="glance-key-growth"','<AirportStaffBriefing ','className="glance-overview-extras"'];
 const positions=markers.map(marker=>glance.indexOf(marker));
 assert.ok(positions.every((position,index)=>position>=0&&(index===0||position>positions[index-1])));
 assert.match(glance,/data-testid="glance-key-growth"[^\n]+<\/a>\s*\{overviewHeading&&<AirportStaffBriefing /);
 assert.equal((glance.match(/<AirportStaffBriefing /g)??[]).length,1);
 assert.doesNotMatch(briefing,/<h2|주목할 공항 흐름|aria-labelledby/,'the detail body must not create a second standalone title/region');
});

test('merged detail body retains its source dates, three subsections, boundaries and destination links',()=>{
 assert.match(briefing,/day\|\|'기준일 확인 중'/);
 assert.match(briefing,/KST 수집/);
 assert.match(briefing,/공식 일정 확인 \{event\.verifiedAt\}/);
 assert.match(briefing,/href=\{event\.sourceURL\}/);
 assert.deepEqual([...briefing.matchAll(/<h3>(.*?)<\/h3>/g)].map(match=>match[1]),['01 시간·터미널','02 노선·휴일 준비','03 품목별 확인']);
 for(const text of ['고객 수나 매장 혼잡 예측은 아닙니다.','노선 국가를 고객 국적으로 해석하지 않으며','확인이 보류된 규정은 단정하지 않습니다.'])assert.ok(briefing.includes(text));
 for(const path of ['/airport${suffix}','/airport-countries${suffix}','/airport-prepare${suffix}#arrival-allowances','/airport-news'])assert.ok(briefing.includes(path));
 assert.equal((briefing.match(/<details(?: open)?>/g)??[]).length,3);
 assert.match(briefing,/<details open><summary>패션·명품<\/summary>/);
});

test('merged details span the summary grid while retaining readable source-note typography',()=>{
 assert.match(styles,/\.airport-staff-briefing\{grid-column:1\/-1;min-width:0;/);
 assert.match(styles,/\.glance-insights \.airport-staff-briefing small\{[^}]*font-size:11px;line-height:1\.7/);
 assert.match(styles,/@media\(max-width:700px\)\{\.staff-brief-grid\{grid-template-columns:1fr;/);
 assert.doesNotMatch(styles,/\.airport-staff-briefing\{[^}]*border-top:/,'no extra standalone divider above the moved detail body');
});
