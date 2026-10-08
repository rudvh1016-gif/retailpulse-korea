import assert from 'node:assert/strict';
import test from 'node:test';
import { currentDutyFreeExchange, dutyFreeSources, nextKstExchangeMidnight } from '../lib/duty-free-exchange';
const time = Date.parse('2026-10-08T03:00:00Z');
const row = {vendor:'shilla',sourceUrl:dutyFreeSources.shilla,verified:true,scope:'INTERNET_SHOP',currency:'USD',krwPerUnit:1343.4,serviceDateKst:'2026-10-08',verifiedAt:'2026-10-08T02:49:39.401Z'};
test('manual FX evidence expires exactly at KST date rollover and cannot become a historical rate',()=>{
  assert.equal(currentDutyFreeExchange([row],time).length,1);
  assert.equal(currentDutyFreeExchange([row],Date.parse('2026-10-08T14:59:59.999Z')).length,1);
  assert.deepEqual(currentDutyFreeExchange([row],Date.parse('2026-10-08T15:00:00Z')),[]);
  assert.deepEqual(currentDutyFreeExchange([row],time,'2026-10-07'),[]);
  assert.deepEqual(currentDutyFreeExchange([row],time,'2026-10-09'),[]);
  assert.equal(nextKstExchangeMidnight(time),Date.parse('2026-10-08T15:00:00Z'));
});
test('unverified, future, malformed, wrong scope/date/currency/source evidence is withheld',()=>{
  for(const changes of [{verified:false},{verifiedAt:'2026-10-08T04:00:00Z'},{verifiedAt:'bad'},{verifiedAt:'2026-10-07T02:00:00Z'},{krwPerUnit:0},{krwPerUnit:-1},{krwPerUnit:NaN},{scope:'AIRPORT_STORE'},{currency:'JPY'},{vendor:'unknown'},{sourceUrl:'https://example.com'},{serviceDateKst:'2026-10-07'}]) assert.deepEqual(currentDutyFreeExchange([{...row,...changes}],time),[],JSON.stringify(changes));
  assert.deepEqual(currentDutyFreeExchange([row,null,{},'bad'],NaN),[]);
});
test('independent vendor rates remain distinct and only latest valid evidence per vendor survives',()=>{
  const newer={...row,krwPerUnit:1344,verifiedAt:'2026-10-08T02:55:00Z'};
  const other={...row,vendor:'shinsegae',sourceUrl:dutyFreeSources.shinsegae,krwPerUnit:1345};
  assert.deepEqual(currentDutyFreeExchange([newer,row,other],time).map(x=>[x.vendor,x.krwPerUnit]),[['shilla',1344],['shinsegae',1345]]);
});
