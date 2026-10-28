import {koreanCompatibilitySource} from './helpers/chinese-source-compat.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';
const read=p=>koreanCompatibilitySource(readFileSync(p,'utf8'));
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
 assert.ok(headings.filter(h=>h.role==='section').length>=66); // Three airport-flow peers are now correctly nested subsections.
 for(const file of ['airport-staff-briefing','airport-focus-production','airport-view','retailpulse-app','tourism-desk','travel-records-view','seoul-comparison'])assert.ok(headings.some(h=>h.file===`app/${file}.tsx`&&h.role));
});
test('every topmost title has the page role, including standalone, preview, loading and fallback views',()=>{
 for(const h of headings.filter(h=>h.tag==='h1'))assert.equal(h.role,'page',`${h.file}: ${h.node.getText(h.tree)}`);
 for(const file of ['airport-glance-preview','airport-focus-preview','airport-focus-production','airport-view','airport-customs-news','seoul-comparison','retailpulse-app','tourism-desk','travel-records-view','personal-home','prediction-view','not-found'])assert.ok(headings.some(h=>h.file===`app/${file}.tsx`&&h.role==='page'),file);
});
test('markers are single empty decorative elements and never added to interactive titles',()=>{
 for(const h of headings){
  if(h.interactive.length)assert.equal(h.role,undefined,`${h.file} interactive heading`);
  if(!h.role)continue;
  assert.ok(['page','section','subsection'].includes(h.role));
  const marker=h.node.children[0];assert.ok(ts.isJsxSelfClosingElement(marker));
  assert.equal(marker.tagName.getText(h.tree),'span');
  assert.match(marker.getText(h.tree),/className="heading-marker" aria-hidden="true"/);
  assert.equal(h.node.children.filter(child=>ts.isJsxSelfClosingElement(child)&&child.attributes.properties.some(a=>a.name?.getText(h.tree)==='className'&&a.initializer?.text==='heading-marker')).length,1);
 }
});
test('screenshot middle headings and equivalent sitewide subsections use the existing semantic role',()=>{
 const focus=headings.filter(h=>h.file==='app/airport-focus-preview.tsx');
 const parent=focus.find(h=>h.node.getText(h.tree).includes('출근 후 30초 확인'));
 assert.equal(parent?.role,'section');
 const today=focus.find(h=>h.node.getText(h.tree).includes('focus-today-title'));
 assert.equal(today,undefined);assert.match(read('app/airport-focus-preview.tsx'),/<p className="focus-report-date">/);
 for(const expression of ['{title}','{t("다음 주"'])assert.ok(focus.some(h=>h.role==='subsection'&&h.node.getText(h.tree).includes(expression)),expression);
 // Airport, preparation and Seoul content share the role without text/locale matching.
 for(const file of ['airport-live-signals','airport-tax-refund-guide','business-compare','tourism-desk','seoul-flow-models'])assert.ok(headings.some(h=>h.file===`app/${file}.tsx`&&h.role==='subsection'),file);
});
test('all headings have no prefix or reserved inset',()=>{
 const css=read('app/heading-hierarchy.css');
 const marker=css.match(/:root body \[data-heading\] > \.heading-marker\s*\{([^}]+)\}/)?.[1];
 assert.equal(marker?.trim(),'display:none!important');
 const base=css.match(/:root body :is\(h1,h2,h3\)\[data-heading\]\s*\{([^}]+)\}/)?.[1];
 assert.ok(base);assert.match(base,/padding-inline-start:0;/);
 assert.match(base,/opacity:1!important/); // Supersede older airport .9 opacity without recoloring body text.
 assert.match(base,/overflow-wrap:anywhere/);assert.match(base,/white-space:normal/);
 assert.match(css,/\[data-heading\]::before,\s*:root body :is\(h1,h2,h3\)\[data-heading\]::after \{content:none!important;display:none!important\}/);
 assert.doesNotMatch(css,/border-radius:50%|padding-inline-start:\.72em|background:currentColor/);
 for(const h of headings){
  const first=h.node.children.find(child=>!(ts.isJsxText(child)&&!child.text.trim())&&!(ts.isJsxSelfClosingElement(child)&&child.getText(h.tree).includes('heading-marker')));
  if(first&&ts.isJsxText(first))assert.doesNotMatch(first.text.trim(),/^[·•‧∙-]/,h.file);
 }
 assert.match(read('app/airport-staff-briefing.tsx'),/<span aria-hidden="true">· <\/span>/); // Terminal-line dot is not a heading marker.
});
test('one charcoal heading palette uses supported weights without recoloring body or data',()=>{
 const css=postcss.parse(read('app/heading-hierarchy.css'));
 const palette={page:['#222326','750'],section:['#222326','700'],subsection:['#222326','600']};
 const colors=[];
 css.walkDecls('color',decl=>{
  if(decl.value==='CanvasText'){assert.equal(decl.parent.parent.params,'(forced-colors:active)');return;}
  if(decl.parent.selector===':root body :is(.focus-report h3,.airport-top-reference > h3,.airport-month-flights > h3)[data-heading="subsection"]'){
   assert.equal(decl.value,'#222326');assert.ok(decl.important);
   const weight=decl.parent.nodes.find(node=>node.prop==='font-weight');assert.equal(weight.value,'700');assert.ok(weight.important);return;
  }
  const role=decl.parent.selector.match(/^:root body :is\(h1,h2,h3\)\[data-heading="(page|section|subsection)"\]$/)?.[1];
  assert.ok(role,decl.parent.selector);assert.equal(decl.value,palette[role][0]);assert.ok(decl.important);
  const weight=decl.parent.nodes.find(node=>node.prop==='font-weight');assert.equal(weight.value,palette[role][1]);assert.ok(weight.important);colors.push(decl.value);
  const channels=decl.value.slice(1).match(/../g).map(hex=>parseInt(hex,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const luminance=channels.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  assert.ok(1.05/(luminance+.05)>=7,`${role} contrast on unchanged white ground`);
 });
 assert.deepEqual(colors,Object.values(palette).map(value=>value[0]));
 assert.match(read('app/globals.css'),/font-family: "KORETAIL Sans Variable";[\s\S]*?font-weight: 45 920;/);
 assert.match(read('app/heading-hierarchy.css'),/:is\(\.lang-ja,\.lang-zh,\[lang="ja"\],\[lang="zh"\]\) :is\(h1,h2,h3\)\[data-heading\] \{font-weight:600!important\}/);
 for(const locale of ['jp','sc'])assert.match(read('app/globals.css'),new RegExp(`noto-sans-${locale}-600\\.woff2[^}]+font-weight: 600;`));
 css.walkDecls(decl=>assert.doesNotMatch(decl.prop,/^(?:background|fill|stroke|font-family|--)/));
});
test('the two detail titles share the airport-flow subsection role without step decoration',()=>{
 const source=read('app/airport-staff-briefing.tsx').replace(/<UiLineIcon kind="(?:week|return|month)"\/>/g,'');
 for(const title of ['시간·터미널','노선·휴일 준비'])assert.ok(source.includes(`<h3 data-heading="subsection" className="airport-flow-item-title"><span className="heading-marker" aria-hidden="true"/>${title==='시간·터미널'?'<span className="airport-flow-check" aria-hidden="true">✓</span>':''}${title}</h3>`));
 assert.equal(headings.filter(h=>h.file==='app/airport-staff-briefing.tsx'&&h.role==='subsection').length,2);
});
test('hierarchy is opt-in, wrapping-safe, and leaves navigation/theme/body tokens alone',()=>{
 const css=read('app/heading-hierarchy.css');
 assert.match(read('app/layout.tsx'),/import "\.\/heading-hierarchy.css"/);
 for(const role of ['page','section','subsection'])assert.ok(css.includes(`[data-heading="${role}"]`));
 assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/white-space:normal/);
 assert.match(css,/font-size:22px/);assert.match(css,/font-size:16px/);assert.match(css,/font-size:18px/);
 assert.match(css,/forced-colors:active/);
 assert.doesNotMatch(css,/--type-body:|\.glass-nav\s*\{|\.bottom-nav\s*\{|body\s*\{/);
});


test('the full home question and destination link have separate rows with only narrow-title scaling',()=>{
 const css=read('app/heading-hierarchy.css'),focus=read('app/airport-focus-preview.css'),source=read('app/airport-focus-trends.tsx');
 assert.match(source,/이어지는 흐름일까'\}<\/h2>\{!full&&<MonthlyAirportScope lang=\{lang\}\/>\}\{onMore&&<button className="focus-trend-more"/);
 assert.match(focus,/\.focus-trend-heading\{display:block\}/);assert.match(focus,/\.focus-trend-heading \.focus-trend-more\{[^}]*min-height:44px/);
 assert.match(css,/@media\(max-width:380px\)\{:root body \.focus-trend-question\[data-heading\]\{font-size:1\.125rem!important\}\}/);
 assert.match(css,/@media\(max-width:340px\)\{:root body \.focus-trend-question\[data-heading\]\{font-size:1\.0625rem!important\}\}/);
 assert.doesNotMatch(css,/white-space:nowrap|text-overflow|overflow:hidden/);
 assert.doesNotMatch(css,/\.airport-view[^{}]*\{[^}]*color:/,'airport headings use the same semantic palette');
});



