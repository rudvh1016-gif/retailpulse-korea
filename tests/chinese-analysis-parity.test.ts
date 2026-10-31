import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {register} from 'node:module';
import ts from 'typescript';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createPeriodTranslator,localizeHolidayName} from '../lib/airport-period/i18n.mjs';
import {calendarEvents,holidaySuggestions} from '../lib/airport-period/calendar.mjs';
import {airportAnalysisText} from '../lib/airport-analysis-copy';
import translations from '../lib/airport-period/zh.json';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {AirportGlanceInsights,AirportCountryInsights}=await import('../app/airport-period-insights');
const read=(file:string)=>readFileSync(file,'utf8');
const hangul=/[가-힣]/;
const numbers=(value:string)=>value.match(/\d+(?:\.\d+)?/g)??[];
const attrs=(value:string)=>[...value.matchAll(/([\w-]+)="([^"]*)"/g)].filter(([,key])=>!['aria-label','title','lang'].includes(key)).map(match=>match[0]);

test('every reviewed iframe literal has Chinese copy and retains numbers, markup controls and Korean bytes',()=>{
 const t=createPeriodTranslator('zh');
 for(const [ko,zh] of Object.entries(translations)){
  assert.equal(t(ko),zh);assert.equal(createPeriodTranslator('ko')(ko),ko);
  assert.doesNotMatch(zh,hangul,ko);
  assert.deepEqual(numbers(zh),numbers(ko),ko+' numeric tokens');
  assert.deepEqual(attrs(zh),attrs(ko),ko+' control attributes');
  assert.deepEqual(zh.match(/<\/?[a-z][a-z0-9-]*/gi),ko.match(/<\/?[a-z][a-z0-9-]*/gi),ko+' element types');
 }
 // Future controls must be added to the dictionary rather than silently falling
 // back to Korean. Weekday names have an explicit paired locale array.
 for(const file of ['lib/airport-period/ui.mjs','lib/airport-period/start.mjs']){
  const root=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const visit=(node:ts.Node)=>{
   if(ts.isStringLiteral(node)&&hangul.test(node.text)){
    const translated=ts.isCallExpression(node.parent)&&node.parent.expression.getText(root)==='t';
    const weekdays=ts.isArrayLiteralExpression(node.parent)&&node.parent.getText(root)=="['월','화','수','목','금','토','일']";
    assert.ok(translated||weekdays,file+': untranslated display literal '+node.text);
   }
   if(ts.isCallExpression(node)&&node.expression.getText(root)==='t'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){
    const value=node.arguments[0].text;assert.ok(Object.hasOwn(translations,value),file+': '+value);
   }
   ts.forEachChild(node,visit);
  };visit(root);
 }
});

test('Chinese static iframe preserves every control and numeric token before JavaScript loads',()=>{
 const ko=read('lib/airport-period/frame.html'),zh=read('lib/airport-period/frame-zh.html');
 const structure=(value:string)=>(value.match(/<[^>]+>/g)??[]).map(tag=>tag.replace(/(?:aria-label|title|lang)="[^"]*"/g,'localized=""'));
 assert.deepEqual(structure(zh),structure(ko));assert.deepEqual(numbers(zh),numbers(ko));assert.doesNotMatch(zh,hangul);
 assert.match(zh,/<html lang="zh-CN">/);assert.match(zh,/正在加载机场记录/);
 assert.match(read('public/airport-period/frame-zh.html'),/runtime\.js\?v=[a-f0-9]{12}/);
});

test('both locales expose the same glance and country controls while English and Japanese stay unchanged',()=>{
 for(const component of [AirportGlanceInsights,AirportCountryInsights]){
  const render=(lang:'ko'|'zh'|'en'|'ja')=>renderToStaticMarkup(h(component,{lang,date:'2026-10-19',children:h('p',null,'Existing content')}));
  const ko=render('ko'),zh=render('zh');
  assert.equal((zh.match(/role="tab"/g)??[]).length,component===AirportGlanceInsights?5:3);
  assert.deepEqual(attrs(zh),attrs(ko));assert.doesNotMatch(zh.replace(/<script[^>]*>[\s\S]*?<\/script>/g,''),hangul);
  assert.equal(render('en'),'<p>Existing content</p>');assert.equal(render('ja'),'<p>Existing content</p>');
 }
 const source=read('app/airport-period-insights.tsx');
 assert.match(source,/lang==='zh'\?'frame-zh\.html':'frame\.html'/);
 assert.match(source,/location\.assign\('\/'\+lang\+'\/airport-countries\?'/);
 assert.match(source,/key=\{lang\+':'\+\(date\?\?'today'\)\}/);
 for(const label of ['공항한눈에','언제 몰렸나요?','항공편 주말이 더 많나요?','어느 터미널이 달라졌나요?','연휴에는 늘었나요?','국가별 흐름'])assert.doesNotMatch(airportAnalysisText('zh',label),hangul);
});

test('official holiday names and recommendations translate only presentation, never source data',()=>{
 const seed=JSON.parse(read('data/airport-focus-preview/calendar-context.json'));
 const manual=JSON.parse(read('data/official-calendar/priority-country-multiyear.json'));
 const calendar={events:[...seed.events.filter((e:{country:string})=>e.country!=='CN'),...manual.events]};
 const before=JSON.stringify(calendar);
 for(const event of calendarEvents(calendar,'2026-10-30'))assert.doesNotMatch(localizeHolidayName('zh',event.name),hangul,event.name);
 const rows=Array.from({length:60},(_,i)=>new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10)).flatMap(date=>['KR','CN','JP'].map(country=>({date,country})));
 for(const suggestion of holidaySuggestions(calendar,rows,'2026-10-30'))for(const name of suggestion.names)assert.doesNotMatch(localizeHolidayName('zh',name),hangul,name);
 assert.equal(JSON.stringify(calendar),before);
 assert.equal(localizeHolidayName('ko','추석'),'추석');
 assert.equal(localizeHolidayName('zh','UNLISTED'),'UNLISTED');
 assert.equal(localizeHolidayName('zh','새로운 공식명'),'새로운 공식명（韩文原文）');
});

test('compact comparison notes retain material limits and only phone note typography changes',()=>{
 const source=read('lib/airport-period/ui.mjs'),css=read('lib/airport-period/style.css');
 for(const text of ['회색: 기준 · 파랑: 비교 (휴일 여부와 무관)','수집일 부족 · ','차이 없음·연휴 효과 단정 불가','누락일은 0편 처리 안 함','정수 반올림 표시 · 계산·차트는 원값','휴일·계절 영향 미분리','승객 국적 아님'])assert.ok(source.includes(text),text);
 assert.match(css,/@media\(max-width:600px\)\{\s*\.holiday-calendar-context>\.holiday-period-key[^}]*font-size:10px;line-height:1\.6/);
 const rule=css.match(/\.holiday-calendar-context>\.holiday-period-key[^}]*\}/)?.[0]??'';
 assert.doesNotMatch(rule,/nowrap|hidden|ellipsis|line-clamp|max-height/);
 assert.match(source,/add\('p',t\('회색: 기준 · 파랑: 비교 \(휴일 여부와 무관\)'\)\)\.className='holiday-period-key'/);
});
