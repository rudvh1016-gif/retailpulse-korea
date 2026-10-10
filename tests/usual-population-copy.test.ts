import assert from 'node:assert/strict';
import test from 'node:test';
import {compareWithUsual} from '../lib/usual-comparison';
import {usualHeadline,usualHeadlineParts} from '../lib/compare-copy';

const reading=(at:string,min:number,max:number)=>({areaCode:'POI026',sourceId:'SEOUL_CITYDATA_PPLTN',schemaVersion:'v1',qualityStatus:'VALID',observedAt:at,populationMin:min,populationMax:max});
const comparison=(currentMin=16000,currentMax=18000,at='2026-10-10T20:10:00+09:00',past='2026-10-03T20:05:00+09:00')=>compareWithUsual({area:'itaewon',current:reading(at,currentMin,currentMax),candidates:[{weekOffset:1,...reading(past,20000,22000)}],holidays:null,todayKst:at.slice(0,10),generatedAt:at});

test('population comparison names both actual observation times and preserves ranges',()=>{
  const result=comparison();
  assert.equal(result.basis,'LAST_WEEK');
  assert.equal(usualHeadline(result,'ko'),'서울시 체류인구 추정(오늘 20:10 KST) 16,000~18,000명은 지난주 10/03 20:05 20,000~22,000명보다 최소 2,000명 적습니다.');
  assert.deepEqual(usualHeadlineParts(result,'ko').filter(part=>part.emphasis).map(part=>part.text),['16,000~18,000명','20,000~22,000명','2,000명']);
});
test('only separated ranges provide a minimum gap; overlap supplies no invented difference',()=>{
  const overlap=comparison(21000,23000);
  assert.match(usualHeadline(overlap,'ko'),/겹칩니다/);
  assert.doesNotMatch(usualHeadline(overlap,'ko'),/최소|%|적습니다|많습니다/);
  assert.match(usualHeadline(comparison(24000,26000),'ko'),/최소 2,000명 많습니다/);
  assert.match(usualHeadline(comparison(22000,23000),'ko'),/겹칩니다/);
});
test('all four languages name estimated population rather than sales or a forecast percentage',()=>{
  const result=comparison();
  for(const [lang,metric] of [['ko','체류인구 추정'],['en','estimated population present'],['zh','人口估计'],['ja','滞在人口推定']] as const){
    assert.ok(usualHeadline(result,lang).includes(metric));
    assert.doesNotMatch(usualHeadline(result,lang),/%|결제|혼잡 예측/);
  }
  const newYear=comparison(16000,18000,'2027-01-03T20:10:00+09:00','2026-12-27T20:05:00+09:00');
  assert.match(usualHeadline(newYear,'ko'),/2026-12-27 20:05/);
  const unavailable={...result,basis:'COLLECTING' as const,range:null,verdict:null};
  assert.doesNotMatch(usualHeadline(unavailable,'ko'),/16,000|2,000|적습니다/);
});
