import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const themes=['beautiful-jekyll','casper','story'];
for(const theme of themes){
 const css=readFileSync(new URL(`./${theme}.css`,import.meta.url),'utf8');
 assert(css.includes(`html[data-content-theme="${theme}"]`));
 assert(!/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;}\s])|line-clamp|overflow\s*:\s*(hidden|clip)|text-overflow|@import/i.test(css),`${theme}: hides/replaces content or imports assets`);
 assert(!/content\s*:\s*(?!["']{2})/.test(css),`${theme}: generated meaningful text`);
 assert([...css.matchAll(/url\(([^)]+)\)/g)].every(match=>match[1]==="'/__preview/story-photo.jpg'"),`${theme}: unapproved asset URL`);
 assert(!/\.change-rate|--change|--rate/.test(css),`${theme}: changes semantic rates`);
}
console.log('PASS: 3 scoped CSS adaptations; no hide/truncate/content replacement or external assets.');
