import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('owner-approved analytics image origin is exact and does not broaden other directives',()=>{
 const s=readFileSync(new URL('../next.config.ts',import.meta.url),'utf8');
 assert.match(s,/img-src 'self' data: blob: https:\/\/www\.googletagmanager\.com;/);
 assert.doesNotMatch(s,/img-src[^;]*\*/);
 assert.match(s,/object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';/);
});
