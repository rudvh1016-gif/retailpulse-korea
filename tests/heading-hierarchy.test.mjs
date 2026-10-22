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
 assert.equal(today?.role,'subsection');assert.match(today.node.getText(today.tree),/오늘 확인/);
 for(const expression of ['{title}','{t("다음 주"','{t("다음 달"'])assert.ok(focus.some(h=>h.role==='subsection'&&h.node.getText(h.tree).includes(expression)),expression);
 // Airport, preparation and Seoul content share the role without text/locale matching.
 for(const file of ['airport-live-signals','airport-departure-preparation','airport-tax-refund-guide','business-compare','tourism-desk','seoul-flow-models'])assert.ok(headings.some(h=>h.file===`app/${file}.tsx`&&h.role==='subsection'),file);
});
test('only internal major headings keep dots; page markers and their reserved inset are removed',()=>{
 const css=read('app/heading-hierarchy.css');
 const page=css.match(/:root body :is\(h1,h2,h3\)\[data-heading="page"\]\s*\{([^}]+)\}/)?.[1];
 assert.ok(page);assert.match(page,/padding-inline-start:0(?:;|$)/);
 const marker=css.match(/:root body \[data-heading="page"\] > \.heading-marker\s*\{([^}]+)\}/)?.[1];
 assert.equal(marker?.trim(),'display:none');
 const base=css.match(/:root body :is\(h1,h2,h3\)\[data-heading\]\s*\{([^}]+)\}/)?.[1];
 assert.ok(base);assert.match(base,/padding-inline-start:\.72em/);
 assert.match(base,/overflow-wrap:anywhere/);assert.match(base,/white-space:normal/);
 assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g,''),/(?:^|})\s*(?:h[123]|[^{}]*data-heading="(?:section|subsection)"[^{}]*)\s*[^{}]*\{[^}]*display:none/);
});
test('only semantic subsection marker geometry changes to a hyphen; internal major dots remain round',()=>{
 const css=read('app/heading-hierarchy.css');
 const base=css.match(/:root body \[data-heading\] > \.heading-marker\s*\{([^}]+)\}/)?.[1];
 assert.ok(base);assert.match(base,/width:\.26em/);assert.match(base,/height:\.26em/);assert.match(base,/border-radius:50%/);
 const override=css.match(/:root body \[data-heading="subsection"\] > \.heading-marker\s*\{([^}]+)\}/)?.[1];
 assert.ok(override);
 const declarations=Object.fromEntries(override.trim().split(';').filter(s=>s.trim()).map(s=>s.trim().split(':')));
 assert.deepEqual(declarations,{top:'.64em',width:'.36em',height:'.08em','border-radius':'0'});
 assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g,''),/(?:h[123]|data-heading="section")\s*[^{}]*>\s*\.heading-marker/);
 assert.doesNotMatch(css,/content\s*:/); // No generated text or duplicate prefix.
 assert.match(read('app/airport-staff-briefing.tsx'),/<span aria-hidden="true">· <\/span>/); // Terminal-line dot is not a heading marker.
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


test('the full home question and destination link have separate rows with only narrow-title scaling',()=>{
 const css=read('app/heading-hierarchy.css'),focus=read('app/airport-focus-preview.css'),source=read('app/airport-focus-trends.tsx');
 assert.match(source,/이어지는 흐름일까'\}<\/h2>\{onMore&&<button className="focus-trend-more"/);
 assert.match(focus,/\.focus-trend-heading\{display:block\}/);assert.match(focus,/\.focus-trend-heading \.focus-trend-more\{[^}]*min-height:44px/);
 assert.match(css,/@media\(max-width:380px\)\{:root body \.focus-trend-question\[data-heading\]\{font-size:1\.125rem!important\}\}/);
 assert.match(css,/@media\(max-width:340px\)\{:root body \.focus-trend-question\[data-heading\]\{font-size:1\.0625rem!important\}\}/);
 assert.doesNotMatch(css,/white-space:nowrap|text-overflow|overflow:hidden/);
 assert.match(css,/\.airport-view :is\(h1,h2\)\[data-heading\] \{color:#24272c;font-weight:650!important\}/);
 assert.match(css,/\.airport-view \.airport-hero h3\[data-heading="subsection"\] \{color:#465361;font-weight:600!important;opacity:1\}/);
});
