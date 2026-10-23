import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';
const read=file=>readFileSync(file,'utf8');

test('passenger and flight figures gain one real localized heading without wrapping or reordering their content',()=>{
 const source=read('app/airport-focus-preview.tsx');
 const tree=ts.createSourceFile('focus.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let figures;
 function visit(node){
  if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(a=>a.name?.getText(tree)==='className'&&a.initializer?.text==='focus-report-lines'))figures=node;
  ts.forEachChild(node,visit);
 }
 visit(tree);assert.ok(figures);
 const children=figures.children.filter(node=>ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node));
 assert.deepEqual(children.map(node=>(ts.isJsxElement(node)?node.openingElement:node).tagName.getText(tree)),['h3','p','p','PassengerBriefComparison','p']);
 for(const text of ['출국객·항공편','Passengers and flights','出境旅客与航班','出国者・便数'])assert.ok(children[0].getText(tree).includes(text));
 assert.match(children[0].getText(tree),/data-heading="subsection"/);
 assert.match(children[1].getText(tree),/context\.passengers/);assert.match(children[1].getText(tree),/context\.transferPassengers/);
 assert.match(children[2].getText(tree),/context\.referenceSum/);assert.match(children[4].getText(tree),/context\.flights/);
 const order=['focus-today-title','focus-report-lines','focus-selected-country-stack','<PreparationBrief lang={lang}','className="focus-report-basis"'].map(text=>source.indexOf(text,source.indexOf('export function OverviewHeadline')));
 assert.ok(order.every((n,i)=>n>=0&&(!i||n>order[i-1])),'mobile DOM reading order stays unchanged');
});

test('brief topic boundaries total 25px rather than stacking full section margins',()=>{
 const css=postcss.parse(read('app/airport-focus-preview.css'));
 const sectionRules=[];css.walkRules(rule=>{if(rule.selector.startsWith('.airport-focus-shell .focus-report .focus-selected-country'))sectionRules.push(rule);});
 for(const selector of ['.airport-focus-shell .focus-report .focus-selected-country-stack','.airport-focus-shell .focus-report .focus-selected-country-changes + .focus-selected-country-changes']){
  const rule=sectionRules.find(r=>r.selector===selector);assert.ok(rule);
  assert.deepEqual(Object.fromEntries(rule.nodes.map(n=>[n.prop,n.value])),{'margin-top':'12px','padding-top':'12px','border-top':'var(--section-rule-width,1px) solid var(--section-rule-color,#d5d9de)'});
 }
 const cssText=css.toString();
 assert.match(cssText,/\.airport-focus-shell \.focus-report \.focus-report-title\{margin-bottom:20px\}/);
 assert.match(cssText,/\.airport-focus-shell \.focus-report \.focus-selected-country-changes\{margin-top:0\}/);
 assert.match(cssText,/\.focus-preparation-brief > div > h3\{margin:0 0 10px\}/);
 const overrides=[];css.walkRules(rule=>{if(rule.selector==='.airport-focus-shell .focus-report .focus-preparation-brief > div:first-child')overrides.push(rule);});
 assert.equal(overrides.length,1);assert.equal(overrides[0].parent.params,'(min-width:1000px)');
 assert.deepEqual(Object.fromEntries(overrides[0].nodes.map(n=>[n.prop,n.value])),{'margin-top':'0','padding-top':'0','border-top':'0'});
});

test('CI geometry checks cover the breakpoint, return topic, title gaps and right-column expansion',()=>{
 const source=read('e2e/brief-desktop-row-spacing.spec.ts');
 for(const evidence of ['999,1000','layout-return-fixture','topicGap','leftTops','firstFuture','toBeLessThanOrEqual(28)','report.screenshot'])assert.ok(source.includes(evidence),evidence);
 assert.match(read('.github/workflows/ci.yml'),/e2e\/brief-desktop-row-spacing.spec.ts/);
});

