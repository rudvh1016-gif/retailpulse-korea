import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

for(const file of ['airport-focus-production.tsx','airport-focus-preview.tsx'])test(`${file}: current checkpoint waits have one trailing slot outside overview extras`,()=>{
 const source=ts.createSourceFile(file,readFileSync(new URL(`../app/${file}`,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const homes=[];
 function visit(node){if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&['AirportGlance','AirportGlancePreview'].includes(node.tagName.getText(source)))homes.push(node);ts.forEachChild(node,visit);}
 visit(source);assert.equal(homes.length,1);
 const attrs=homes[0].attributes.properties;
 const prop=name=>attrs.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)===name)?.initializer?.getText(source);
 assert.ok(prop('overviewExtras').includes('HolidayList'));assert.ok(prop('overviewExtras').includes('focus-staff-links'));
 assert.ok(!prop('overviewExtras').includes('CountryTrends'));
 assert.equal((prop('trailingContent').match(/<HomeCheckpointWaits /g)||[]).length,1);
 assert.match(prop('trailingContent'),/summary=\{summary\} now=\{now\} lang=\{lang\}/);
 assert.doesNotMatch(prop('trailingContent'),/\bfull\b/);
});
test('shared glance renders trailing content after future section and immediately before metadata footer',()=>{
 const source=readFileSync(new URL('../app/airport-glance-preview.tsx',import.meta.url),'utf8');
 assert.match(source,/overviewExtras\?:ReactNode;trailingContent\?:ReactNode/);
 assert.ok(source.indexOf("typeof trailingContent==='function'")>source.indexOf('className="glance-future"'));
 assert.match(source,/trailingContent\(\{summary,now:clock\}\):trailingContent\}\s*<footer><span>\{c.collected\}/);
 assert.equal((source.match(/trailingContent\(\{summary,now:clock\}\)/g)||[]).length,1);
});
