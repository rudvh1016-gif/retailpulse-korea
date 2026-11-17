import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const workflow=readFileSync('.github/workflows/site-smoke.yml','utf8');
const block=workflow.match(/\/\/ BEGIN AIRPORT ONLY CONTRACT([\s\S]*?)\/\/ END AIRPORT ONLY CONTRACT/)?.[1];
assert.ok(block);
const check=runInNewContext(`${block};retiredSeoulProjection`);
function fixture(){return {mode:'live-summary',sources:[{sourceId:'SEOUL_SUBWAY_RIDERSHIP'},{sourceId:'KMA_VILAGE_FCST'}],areas:Object.fromEntries(['myeongdong','hongdae','seongsu','itaewon'].map(area=>[area,{context:null,realtime:null,commercial:null,sales:null,storeDynamics:null,foreignPresence:null,foreignPurposeMobility:null,observedSeries:[],realtimeForecast:[],events:[],eventCount:0,weather:[{temperature:10}],subwayRidership:{boardings:10}}]))};}
test('real smoke accepts retired Seoul compatibility projections while preserving weather/subway',()=>assert.equal(check(fixture()),true));
test('real smoke rejects leaked retired data, source status or incomplete response',()=>{
 for(const key of ['context','realtime','commercial','sales','storeDynamics','foreignPresence','foreignPurposeMobility']){const body=fixture();body.areas.hongdae[key]={};assert.equal(check(body),false,key);}
 for(const key of ['observedSeries','realtimeForecast','events']){const body=fixture();body.areas.hongdae[key]=[{}];assert.equal(check(body),false,key);}
 for(const sourceId of ['SEOUL_CITYDATA_PPLTN','SEOUL_STORE_DYNAMICS','KTO_TOURAPI_EVENT']){const body=fixture();body.sources.push({sourceId});assert.equal(check(body),false);}
 for(const key of ['weather','subwayRidership']){const body=fixture();delete body.areas.hongdae[key];assert.equal(check(body),false);}
 assert.equal(Boolean(check({})),false);
});
