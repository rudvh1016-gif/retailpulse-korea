import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreferences, recommendedPreferences, availableInterests, buildPersonalBrief, toggleChoice, briefingDate } from '../lib/personal-briefing.ts';

test('multiple places, terminals and days survive storage without discarding legacy settings',()=>{
  const p={...recommendedPreferences('manager'),selectedLocations:['airport','seongsu'],selectedTerminals:['T1','T2'],terminal:'T1',selectedDays:['tomorrow','today','yesterday']};
  assert.deepEqual(parsePreferences(JSON.stringify(p)),p);
  assert.equal(parsePreferences(JSON.stringify({...p,selectedDays:[]})),null);
  assert.equal(parsePreferences(JSON.stringify({...p,selectedLocations:['airport','private']})),null);
  assert.equal(parsePreferences(JSON.stringify({...p,selectedDays:['today','today']})),null);
  assert.deepEqual(toggleChoice(['today'],'today'),['today']);
  assert.deepEqual(toggleChoice(['today'],'yesterday'),['today','yesterday']);
  assert.equal(briefingDate('2026-01-01','yesterday'),'2025-12-31');
});

test('device preferences reject malformed, obsolete and non-public values', () => {
  for (const raw of ['bad', '{}', 'null', JSON.stringify({version: 9}), JSON.stringify({...recommendedPreferences('tourist'), location: 'busan'})]) assert.equal(parsePreferences(raw), null);
  const p = recommendedPreferences('manager');
  assert.equal(p.day, 'tomorrow');
  assert.deepEqual(parsePreferences(JSON.stringify(p)), p);
  assert.equal(parsePreferences(JSON.stringify({...p, interests: ['email']})), null);
  assert.equal(recommendedPreferences('guide').day, 'today');
});
test('only existing local information can be selected', () => {
  assert.ok(!availableInterests('airport').includes('weather'));
  assert.ok(!availableInterests('hongdae').includes('flights'));
});
const base = {mode:'live-summary', generatedAt:'2026-09-08T01:00:00Z', todayKst:'2026-09-08',serviceDateKst:'2026-09-09',dayRelation:'FUTURE', areas:{}, airport:{serviceDateKst:'2026-09-09',forecastCoverage:{all:'PARTIAL',byTerminal:{T1:'COMPLETE'}}, todayExpectedPassengersTotal:999, todayExpectedPassengersByTerminal:{T1:123},peakExpectedTimeBandByTerminal:{},flightScope:{CONCOURSE:12}}};
test('yesterday uses the requested saved airport forecast without presenting it as actual or future advice',()=>{
  const summary={...base,todayKst:'2026-09-10',dayRelation:'PAST'};
  const result=buildPersonalBrief(summary,{...recommendedPreferences('manager'),day:'yesterday',terminal:'T1'},'2026-09-09','ko');
  assert.equal(result.cards.find(c=>c.interest==='passengers')?.value,'123');
  assert.match(result.cards[0].note,/예상/);
  assert.deepEqual(result.actions,[]);
});
test('partial coverage cannot become a whole day passenger number', () => {
  const result = buildPersonalBrief(base, recommendedPreferences('manager'), '2026-09-09', 'ko');
  assert.ok(!JSON.stringify(result).includes('999'));
});
test('concourse never borrows T1 passenger forecast', () => {
  const p = {...recommendedPreferences('manager'), terminal:'CONCOURSE'};
  assert.ok(!JSON.stringify(buildPersonalBrief(base,p,'2026-09-09','ko')).includes('123'));
});
test('empty flight scope counters do not fabricate a zero for an uncollected date',()=>{
  const s={...base,airport:{...base.airport,departuresTrackedToday:null,flightScope:{CONCOURSE:0}}};
  const p={...recommendedPreferences('manager'),terminal:'CONCOURSE'};
  const b=buildPersonalBrief(s,p,'2026-09-09','ko');
  assert.equal(b.cards.some(c=>c.interest==='flights'),false);
  assert.equal(b.actions.length,0);
});
test('wrong-date payload cannot supply any briefing facts', () => {
  assert.equal(buildPersonalBrief(base,recommendedPreferences('manager'),'2026-09-10','ko').cards.length, 0);
});
test('Seoul tomorrow never reuses today observations, weather or expired events',()=>{
  const s={...base,areas:{hongdae:{realtime:{observedAt:'2026-09-08T10:00:00+09:00',populationMin:111,populationMax:222,freshness:'LIVE'},realtimeForecast:[{targetAt:'2026-09-09T11:00:00+09:00',populationMin:300,populationMax:400,congestionLevel:3}],weather:[{targetAt:'2026-09-08T11:00:00+09:00',precipitationProbability:99}],events:[{title:'expired',eventStart:'2026-09-07',eventEnd:'2026-09-08'}],foreignPresence:{value:555,referenceAt:'2026-08-01'}}}};
  const b=buildPersonalBrief(s,recommendedPreferences('manager','hongdae'),'2026-09-09','ko');
  assert.ok(!JSON.stringify(b).includes('111'));
  assert.ok(!JSON.stringify(b).includes('99%'));
  assert.ok(!JSON.stringify(b).includes('expired'));
  assert.match(b.cards.find(c=>c.interest==='foreign').note,/과거/);
  assert.match(b.cards.find(c=>c.interest==='crowding').note,/일부 시간대/);
});
