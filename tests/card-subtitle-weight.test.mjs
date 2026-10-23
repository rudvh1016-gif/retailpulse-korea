import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import ts from 'typescript';
const read=file=>readFileSync(file,'utf8');
const css=postcss.parse(read('app/heading-hierarchy.css'));
const rule=css.nodes.find(node=>node.type==='rule'&&node.selector.includes('.glance-insights > a > span'));
test('card subtitles change only to locale-supported semibold, preserving color and size',()=>{
 assert.ok(rule);
 assert.deepEqual(rule.nodes.map(({prop,value,important})=>({prop,value,important})),[{prop:'font-weight',value:'600',important:true}]);
 for(const selector of ['.facility-card-head > h3','.personal-facts > article > h3','.district-glance-section > h3','.tourism-event-header > h3','.update-notice-items > section > div > h3'])assert.ok(rule.selector.includes(selector),selector);
 assert.doesNotMatch(rule.selector,/\b(?:strong|small|button|summary|label|input)\b|glance-building|date-calendar/);
});
test('the three requested insight titles are isolated from numerical values and basis copy in all locales',()=>{
 const source=read('app/airport-glance-preview.tsx'),tree=ts.createSourceFile('glance.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),cards=[];
 function visit(node){
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(tree)==='a'){
   const id=node.openingElement.attributes.properties.find(a=>a.name?.getText(tree)==='data-testid')?.initializer?.text;
   if(['glance-key-wait','glance-key-upcoming','glance-key-growth'].includes(id))cards.push(node);
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);assert.equal(cards.length,3);
 for(const card of cards){const elements=card.children.filter(ts.isJsxElement);assert.deepEqual(elements.map(node=>node.openingElement.tagName.getText(tree)),['h3','strong','small']);assert.match(elements[0].getText(tree),/ic\.(wait|upcoming|growth)/);assert.match(elements[0].getText(tree),/className="airport-flow-item-title"/);}
 for(const title of ['지금 가장 긴 출국장 대기','앞으로 출발편 집중 시간','전월비 일평균 가장 늘어난 목적지'])assert.ok(source.includes(title));
});
