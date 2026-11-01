import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('the shell stylesheet and preload share the current font content version',()=>{
 const bytes=readFileSync('public/fonts/koretail-sans-variable.woff2'),hash=createHash('sha256').update(bytes).digest('hex');
 const css=readFileSync('app/globals.css','utf8'),source=readFileSync('app/shell-font-preload.ts','utf8');
 const match=css.match(/font-family:\s*"KORETAIL Sans Variable";\s*src:\s*url\("([^"]+)"\)/);assert.ok(match);
 const url=new URL(match[1],'https://example.org');assert.equal(url.pathname,'/fonts/koretail-sans-variable.woff2');assert.equal(url.searchParams.get('v'),hash.slice(0,12));
 assert.deepEqual([...source.matchAll(/\b(?:ko|en)\s*:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]),[match[1],match[1]]);
 assert.equal([...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].filter(face=>/font-family:\s*"KORETAIL Sans Variable"/.test(face[1])).length,1);
 assert.ok(bytes.length<300_000);
});
