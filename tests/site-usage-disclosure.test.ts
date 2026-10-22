import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SiteUsageGuide} from '../app/site-usage-guide';
import {passengerCopy} from '../lib/passenger-copy';

for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: optional examples and long methodology explanations collapse, not truth boundaries`,()=>{
 const html=renderToStaticMarkup(h(SiteUsageGuide,{lang}));
 const details=html.match(/<details\b[^>]*>[\s\S]*?<\/details>/g)??[];
 assert.equal(details.length,3);
 for(const detail of details){assert.doesNotMatch(detail.split('>')[0],/\bopen\b/);assert.match(detail,/<summary style="min-height:44px;box-sizing:border-box;padding:12px 0;cursor:pointer">/);}
 assert.equal((details[0].match(/<dt>/g)??[]).length,3);
 assert.match(details[1],/<p>/);
 assert.ok(details[1].includes('data-testid="usage-method"'));
 assert.match(details[2],/<p>/);
 const visible=html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
 assert.ok(visible.includes(passengerCopy.scope[lang]));
 assert.ok(visible.includes(passengerCopy.limitation[lang]));
 assert.ok(visible.includes(passengerCopy.noSum[lang]));
 assert.match(visible,/class="site-usage-limit"/);
 assert.equal((visible.match(/<h3\b[^>]*>/g)??[]).length,1);
});
test('native disclosures need no client state, hidden content deletion or new backgrounds',()=>{
 const source=readFileSync('app/site-usage-guide.tsx','utf8');
 assert.doesNotMatch(source,/useState|onClick|preventDefault|background|aria-expanded/);
 assert.match(source,/<ReadingParagraphs text=\{t.method\}/);
});
