import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const read=file=>readFileSync(new URL(`../app/${file}`,import.meta.url),'utf8');
const css=Object.fromEntries(['globals.css','airport-monthly-flights.css','seoul-comparison.css','monthly-records.css'].map(file=>[file,postcss.parse(read(file))]));
function rule(file,selector){
 const matches=[];css[file].walkRules(selector,node=>matches.push(node));
 assert.equal(matches.length,1,`${file}: ${selector} has one owner`);
 assert.equal(matches[0].parent.type,'root','same compact spacing at mobile and desktop widths');
 return Object.fromEntries(matches[0].nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
}
const line='var(--section-rule-width) solid var(--section-rule-color)';
const gap='var(--section-gap)';
const targets=[
 ['airport-monthly-flights.css','.airport-month-flights'],
 ['airport-monthly-flights.css','.airport-country-changes'],
 ['airport-monthly-flights.css','.airport-country-changes + .airport-month-table'],
 ['seoul-comparison.css','.district-glance-section'],
 ['monthly-records.css','.records-chart'],
 ['globals.css','.site-usage-guide'],
 ['globals.css','.site-usage-guide > h3'],
];

test('semantic rules use one neutral 1px token and a compact 12px gap, not row colors',()=>{
 const tokens={};css['globals.css'].walkRules(':root',node=>node.walkDecls(decl=>{tokens[decl.prop]=decl.value;}));
 assert.equal(tokens['--section-rule-color'],'#d5d9de');
 assert.equal(tokens['--section-rule-width'],'1px');
 assert.equal(tokens['--section-gap'],'12px');
 assert.equal(tokens['--line'],'#e5e5e5','existing table/row rules are not recolored');
});

test('month overview, country ranking and zone table receive distinct single boundaries',()=>{
 const month=rule('airport-monthly-flights.css','.airport-month-flights');
 assert.equal(month['margin-block'],`${gap} 24px`);assert.equal(month['padding-top'],gap);
 const countries=rule('airport-monthly-flights.css','.airport-country-changes');
 assert.equal(countries['margin-block'],`${gap} 16px`);assert.equal(countries['padding-top'],gap);
 assert.deepEqual(rule('airport-monthly-flights.css','.airport-country-changes + .airport-month-table'),{'padding-top':'8px','border-top':line});
 // Keep nested disclosure/table and per-country row rules byte-for-byte in meaning.
 assert.equal(rule('airport-monthly-flights.css','.airport-country-changes li')['border-top'],'1px solid #ddd');
 assert.deepEqual(rule('airport-monthly-flights.css','.airport-month-table'),{'min-width':'0'});
});

test('district subsection rules preserve the existing two/four-column grid and 20px rhythm',()=>{
 assert.deepEqual(rule('seoul-comparison.css','.district-glance-section'),{'margin-top':gap,'padding-top':'8px','border-top':line});
 assert.match(read('seoul-comparison.css'),/\.district-choice-grid \{ display:grid; grid-template-columns:repeat\(4,minmax\(0,1fr\)\); gap:24px; \}/);
 assert.match(read('seoul-comparison.css'),/@media\(max-width:960px\) \{ \.district-choice-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \} \}/);
});

test('record chart reuses its former 25px top gap and keeps its width and bottom margin',()=>{
 assert.deepEqual(rule('monthly-records.css','.records-chart'),{margin:`${gap} 0 20px`,'padding-top':gap,'border-top':line,'max-width':'880px'});
});

test('usage introduction and counting method replace existing gaps without changing disclosure behavior',()=>{
 assert.deepEqual(rule('globals.css','.site-usage-guide'),{'margin-top':'14px','padding-top':'13px','border-top':line});
 assert.deepEqual(rule('globals.css','.site-usage-guide > h3'),{'margin-top':'13px','padding-top':gap,'border-top':line});
 assert.deepEqual(rule('globals.css','.site-usage-guide h3'),{margin:'26px 0 8px','font-size':'17px'});
 assert.deepEqual(rule('globals.css','.site-usage-guide > details[open] + h3'),{'margin-top':'26px','padding-top':'0','border-top':'0'});
 const source=read('site-usage-guide.tsx');
 for(const id of ['usage-examples','usage-method','usage-updates'])assert.match(source,new RegExp(`<details data-testid="${id}">`));
});

test('each local spacing budget is unchanged or increases by at most 9px',()=>{
 // [old top spacing, new outer margin + 1px rule + inner padding].
 // These are declaration budgets, not a claim of measured browser geometry.
 const budgets=[['month',24,12+1+12],['ranking',16,12+1+12],['zone table',16,16+1+8],['district',20,12+1+8],['record chart',25,12+1+12],['usage',28,14+1+13],['method',26,13+1+12]];
 for(const [name,before,after] of budgets){assert.ok(after-before>=0,name);assert.ok(after-before<=9,name);}
});

test('only the seven named content transitions consume the new rule, never all headings or rows',()=>{
 const actual=[];
 for(const [file,root] of Object.entries(css))root.walkRules(node=>{
  if(node.nodes.some(decl=>decl.type==='decl'&&decl.value.includes('var(--section-rule-width)')))actual.push([file,node.selector]);
 });
 assert.deepEqual(actual.map(row=>row.join(':')).sort(),targets.map(row=>row.join(':')).sort());
 for(const [file,selector] of targets){
  const styles=rule(file,selector);assert.equal(styles['border-top'],line);
  for(const prop of Object.keys(styles))assert.doesNotMatch(prop,/^(?:background|box-shadow|border-(?:bottom|left|right)|display|grid|order|position|height|min-height)/,`${selector}: ${prop}`);
 }
});
