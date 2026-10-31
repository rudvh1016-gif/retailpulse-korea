import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
const read=file=>readFileSync(file,'utf8');
test('glance arrows scroll the rail independently of URL selection and observe content widths',()=>{
 const source=read('app/airport-period-insights.tsx');
 assert.match(source,/element\.scrollBy\(\{left:direction\*Math\.max\(120,element\.clientWidth\*\.8\),behavior:'instant'\}\)/);
 assert.match(source,/querySelectorAll\('\[role=tab\]'\)\.forEach\(tab=>observer\.observe\(tab\)\)/);
 assert.match(source,/aria-label=\{t\('다음 메뉴 보기'\)\} aria-controls=\"airport-glance-tabs\" disabled=\{!edges\.next\}/);
 assert.match(source,/document\.activeElement===previousButton\.current\)pendingFocus\.current='next'/);
 assert.match(source,/document\.activeElement===nextButton\.current\)pendingFocus\.current='previous'/);
 assert.match(source,/useLayoutEffect\(\(\)=>\{\s*const button=pendingFocus[\s\S]*?button\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/strip\?\.contains\(active\)\)active\.scrollIntoView\(\{block:'nearest',inline:'nearest',behavior:'instant'\}\)/);
 assert.match(source,/if\(keyboardNavigation\.current\)revealFocusedGlanceTab\(strip\.current\)/);
 for(const event of ['onPointerDownCapture','onWheelCapture'])assert.ok(source.includes(event+'={()=>{keyboardNavigation.current=false;}}'));
 assert.match(source,/const scroll=\(direction:number\)=>\{keyboardNavigation\.current=false;/);
});
test('arrow layout stays phone-only with touch targets and focus indication',()=>{
 const css=postcss.parse(read('app/airport-period-insights.css'));
 const rules=[];css.walkRules(rule=>{if(rule.selector.startsWith('.airport-insight-scroll'))rules.push(rule);});
 assert.ok(rules.some(rule=>rule.parent.type==='root'&&rule.toString()==='.airport-insight-scroll{display:none}'));
 for(const rule of rules.filter(rule=>rule.parent.type!=='root'))assert.equal(rule.parent.params,'(max-width:700px)');
 const target=rules.find(rule=>rule.nodes.some(node=>node.prop==='min-width'));
 assert.ok(target.nodes.some(node=>node.prop==='min-width'&&node.value==='44px'));
 assert.ok(target.nodes.some(node=>node.prop==='min-height'&&node.value==='48px'));
 assert.ok(rules.some(rule=>rule.selector.includes(':focus-visible')));
});
test('only the empty/loading comparison copy gets the small support-text class',()=>{
 const source=read('app/airport-focus-preview.tsx'),css=read('app/airport-focus-preview.css');
 assert.match(source,/<p className="focus-country-change-empty">\{chineseText\(lang,context\.flights===null/);
 assert.match(css,/\.focus-selected-country-changes>p\.focus-country-change-empty\{font-size:12px;line-height:1\.6\}/);
 assert.equal(source.split('className="focus-country-change-empty"').length-1,1);
});
