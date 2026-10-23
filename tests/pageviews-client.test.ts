import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// Enable only an isolated test copy, never a runtime bypass in deployed code.
const dir = mkdtempSync(join(tmpdir(), 'koretail-pageviews-client-'));
const source = readFileSync(new URL('../lib/pageviews-client.ts', import.meta.url), 'utf8')
 .replace("from './pageviews-contract'", "from '" + new URL('../lib/pageviews-contract.ts', import.meta.url).href + "'")
 .replace("import { PAGEVIEWS_DEPLOYMENT_ENABLED } from './pageviews-deployment';", 'const PAGEVIEWS_DEPLOYMENT_ENABLED = true;');
const fixture = join(dir, 'client.mts'); writeFileSync(fixture, source);
const { trackOwnPageview, getPageviewsSnapshot, subscribePageviews } = await import(pathToFileURL(fixture).href);
import { trackOwnPageview as trackDisabledPageview } from '../lib/pageviews-client';

const requests: string[] = [];
const calls: Array<{path:string;id:string}> = [];
const original = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, fetch: globalThis.fetch };
const location = { origin:'https://koretaildata.com', pathname:'/ko' };
Object.defineProperty(globalThis,'window',{value:{location},configurable:true});
Object.defineProperty(globalThis,'document',{value:{prerendering:false},configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{webdriver:false,doNotTrack:'0'},configurable:true});
Object.defineProperty(globalThis,'fetch',{value:async (_:unknown,init:RequestInit)=>{requests.push(init.method ?? 'GET');if(init.body)calls.push(JSON.parse(String(init.body)));return Response.json({available:true,today:calls.length,total:calls.length,totalComplete:true,day:'2026-10-23',startedAt:'2026-10-23T12:00:00Z'});},configurable:true});
const settle = () => new Promise(resolve=>setTimeout(resolve,0));
test('rendered route once, rerender/StrictMode not extra, navigation back counts, optout stops',async()=>{
 let notifications=0;const off=subscribePageviews(()=>notifications++);
 trackOwnPageview('/ko',true);trackOwnPageview('/ko',true);await settle();assert.equal(calls.length,1);assert.equal(getPageviewsSnapshot()?.available,true);
 trackOwnPageview('/ko/airport',true);trackOwnPageview('/ko',true);await settle();assert.equal(calls.length,3);assert.equal(new Set(calls.map(c=>c.id)).size,3);
 trackOwnPageview('/ko/more',false);await settle();assert.equal(calls.length,3);assert.equal(requests.at(-1),'GET');assert.equal(getPageviewsSnapshot()?.available,true);
 trackOwnPageview('/ko/more',true);await settle();assert.equal(calls.length,4);
 trackOwnPageview('/ko/more',false);trackOwnPageview('/ko/more',true);await settle();assert.equal(calls.length,4);assert.equal(getPageviewsSnapshot()?.available,true);
 trackOwnPageview('/admin',true);assert.equal(calls.length,4);
 assert.ok(notifications>0);off();
});
test('compile-time disabled client makes no network request',async()=>{const before=requests.length;trackDisabledPageview('/ko',true);await settle();assert.equal(requests.length,before);});
test('preview and webdriver browsers never send',async()=>{
 location.origin='http://localhost:5173';trackOwnPageview('/ko/about',true);await settle();assert.equal(calls.length,4);
 location.origin='https://koretaildata.com';Object.defineProperty(globalThis,'navigator',{value:{webdriver:true},configurable:true});trackOwnPageview('/ko/about',true);await settle();assert.equal(calls.length,4);
});
test.after(()=>{rmSync(dir,{recursive:true,force:true});for(const [key,value] of Object.entries(original))Object.defineProperty(globalThis,key,{value,configurable:true});});
