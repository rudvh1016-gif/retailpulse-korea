import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(`${dir}/${entry.name}`):entry.name.endsWith('.tsx')?[`${dir}/${entry.name}`]:[]);
const headings=[];
for(const file of files('app')){
 const source=read(file),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(node){
  if(ts.isJsxElement(node)&&/^h[123]$/.test(node.openingElement.tagName.getText(tree))){
   const attributes=node.openingElement.attributes.properties;
   const role=attributes.find(a=>a.name?.getText(tree)==='data-heading')?.initializer?.text;
   const interactive=[];for(let p=node.parent;p;p=p.parent)if(ts.isJsxElement(p)&&/^(button|summary|a)$/.test(p.openingElement.tagName.getText(tree)))interactive.push(p);
   headings.push({file,role,interactive,node,tree,tag:node.openingElement.tagName.getText(tree)});
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
}
test('explicit heading roles cover all non-interactive page/section headings',()=>{
 for(const h of headings.filter(h=>h.tag!=='h3'&&!h.interactive.length&&!/airport-model-scope|glance-building-label/.test(h.node.getText(h.tree))))assert.ok(h.role,`${h.file}: ${h.node.getText(h.tree)}`);
 assert.ok(headings.filter(h=>h.role==='page').length>=20);
 assert.ok(headings.filter(h=>h.role==='section').length>=69);
 for(const file of ['airport-staff-briefing','airport-focus-production','airport-view','retailpulse-app','tourism-desk','travel-records-view','seoul-comparison'])assert.ok(headings.some(h=>h.file===`app/${file}.tsx`&&h.role));
});
test('dots are empty decorative elements and never added to interactive titles',()=>{
 for(const h of headings){
  if(h.interactive.length)assert.equal(h.role,undefined,`${h.file} interactive heading`);
  if(!h.role)continue;
  assert.ok(['page','section','subsection'].includes(h.role));
  const marker=h.node.children[0];assert.ok(ts.isJsxSelfClosingElement(marker));
  assert.equal(marker.tagName.getText(h.tree),'span');
  assert.match(marker.getText(h.tree),/className="heading-marker" aria-hidden="true"/);
 }
});
test('screenshot-requested three briefing titles use major section scale without changing copy',()=>{
 const source=read('app/airport-staff-briefing.tsx');
 for(const title of ['01 시간·터미널','02 노선·휴일 준비','03 품목별 확인'])assert.ok(source.includes(`<h3 data-heading="section"><span className="heading-marker" aria-hidden="true"/>${title}</h3>`));
 assert.equal(headings.filter(h=>h.file==='app/airport-staff-briefing.tsx'&&h.role==='section').length,3);
});
test('hierarchy is opt-in, wrapping-safe, and leaves navigation/theme/body tokens alone',()=>{
 const css=read('app/heading-hierarchy.css');
 assert.match(read('app/layout.tsx'),/import "\.\/heading-hierarchy.css"/);
 for(const role of ['page','section','subsection'])assert.ok(css.includes(`[data-heading="${role}"]`));
 assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/white-space:normal/);
 assert.match(css,/font-size:clamp\(28px,3vw,36px\)/);assert.match(css,/font-size:clamp\(22px,2.2vw,26px\)/);assert.match(css,/font-size:clamp\(18px,1.7vw,20px\)/);
 assert.match(css,/background:currentColor/);assert.match(css,/forced-colors:active/);
 assert.doesNotMatch(css,/--type-body:|\.glass-nav\s*\{|\.bottom-nav\s*\{|body\s*\{/);
});
