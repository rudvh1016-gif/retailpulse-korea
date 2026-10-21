import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const themes=['beautiful-jekyll','casper','story'];
for(const theme of themes){
 const css=readFileSync(new URL(`./${theme}.css`,import.meta.url),'utf8');
 assert(css.includes(`html[data-content-theme="${theme}"]`));
 assert(!/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;}\s])|line-clamp|overflow\s*:\s*(hidden|clip)|text-overflow|content\s*:|@import|url\(/i.test(css),`${theme}: hides/replaces content or imports assets`);
 assert(!/\.change-rate|--change|--rate/.test(css),`${theme}: changes semantic rates`);
}
console.log('PASS: 3 scoped CSS adaptations; no hide/truncate/content replacement or external assets.');
