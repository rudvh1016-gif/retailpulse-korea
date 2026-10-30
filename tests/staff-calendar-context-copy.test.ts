import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AirportFocusData} from '../app/airport-focus-data';
import {chineseText} from '../lib/chinese-ui';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {StaffCalendarContext}=await import('../app/airport-focus-preview');
for(const lang of ['ko','zh'] as const)test(`${lang}: weekly calendar separates names/dates and folds exact scope, source and review date`,()=>{
 const html=renderToStaticMarkup(h(AirportFocusData.Provider,{value:{asOf:'2026-10-30',trends:[],checkedAt:null,preview:false,failed:false}},h(StaffCalendarContext,{lang,onMore:()=>{}})));
 const visible=html.split('<details class="focus-staff-calendar-source">')[0];
 assert.match(visible,/2026-10-26–2026-11-01/);
 assert.match(visible,/class="focus-staff-calendar-event" data-country="MM"/);assert.match(visible,/data-country="KZ"/);
 for(const date of ['2026-10-25','2026-10-27','2026-10-26'])assert.ok(visible.includes(`dateTime="${date}"`));
 assert.doesNotMatch(visible,/종료되었습니다|확인 2026|2026-10-19|외교부|국가별 공식 일정/);
 assert.match(html,/<details class="focus-staff-calendar-source"><summary>/);assert.doesNotMatch(html,/<details[^>]* open/);
 assert.match(html,/2026-10-19/);assert.match(html,/https:\/\/www\.mofa\.gov\.mm\/about-myanmar\/public-holidays\//);assert.match(html,/https:\/\/www\.gov\.kz\/article\/33969\?lang=kk/);
 assert.ok(html.includes(chineseText(lang,'일정만으로 고객 국적·매출·출국 집중 시점을 판단하지 않습니다.')));
 if(lang==='zh')assert.doesNotMatch(html.replace(/<[^>]*>/g,''),/[가-힣]/);
});
test('weekly event spacing and smaller phone secondary copy are scoped, preserving desktop and main text',()=>{
 const css=readFileSync('app/airport-focus-preview.css','utf8'),addition=css.split('/* Weekly official events:')[1].split('/* End weekly official events. */')[0];
 assert.ok(addition);assert.match(addition,/\.focus-staff-calendar \.focus-staff-calendar-event\+\.focus-staff-calendar-event\{margin-top:16px\}/);
 assert.doesNotMatch(addition,/!important|font-family|font-weight|\.focus-week-/);assert.match(addition,/font-size:12px/);assert.match(addition,/@media\(max-width:700px\)\{\.focus-staff-calendar>small,\.focus-staff-calendar \.focus-staff-calendar-source\{font-size:11px\}\}/);
 const source=readFileSync('app/airport-focus-preview.tsx','utf8').split('export function StaffCalendarContext(')[1].split('function TrendsPlaceholder')[0];
 assert.doesNotMatch(source,/describeHolidayPeriod/);assert.match(source,/planningHolidays\(events,start,end,asOf,new Map\(\)\)/);
});
