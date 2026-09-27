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
test('today retains the latest Seoul observation across midnight without inventing selected-day history',()=>{
  for(const location of ['myeongdong','hongdae','seongsu']) {
    const observedAt='2026-09-08T23:55:00+09:00';
    const s={...base,generatedAt:'2026-09-09T00:05:00+09:00',todayKst:'2026-09-09',dayRelation:'TODAY',areas:{[location]:{realtime:{observedAt,populationMin:10000,populationMax:12000,freshness:'LIVE'}}}};
    const p={...recommendedPreferences('manager',location),day:'today'};
    const card=buildPersonalBrief(s,p,'2026-09-09','ko').cards.find(c=>c.interest==='passengers');
    assert.equal(card?.value,'10,000–12,000');
    assert.equal(card?.at,observedAt);
    for(const date of ['2026-09-08','2026-09-10']) {
      assert.equal(buildPersonalBrief({...s,serviceDateKst:date},p,date,'ko').cards.some(c=>c.interest==='passengers'),false);
    }
    s.areas[location].realtime.freshness='STALE';
    const stale=buildPersonalBrief(s,p,'2026-09-09','ko').cards.find(c=>c.interest==='passengers');
    assert.equal(stale?.at,observedAt);
    assert.notEqual(stale?.note,card?.note);
  }
});
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

test('future briefing uses weekday-matched partial schedules and shows airline counts', async()=>{
  const {summarizeScheduledBriefing}=await import('../lib/scheduled-briefing.ts');
  const row={terminal:'T2',operatingFlight:'KE703',scheduledTime:'08:00',weekdays:'["WED"]',validFrom:'2026-09-01',validTo:'2026-09-30',retrievedAt:'2026-09-08T00:00:00Z'};
  const lookup=()=>({name:'Korean Air',country:'KR'});
  const schedule=summarizeScheduledBriefing([row,{...row,retrievedAt:'2026-09-08T01:00:00Z'},{...row,operatingFlight:'KE999',weekdays:'["TUE"]'},{...row,operatingFlight:'KE888',validTo:'2026-09-08'},{...row,operatingFlight:'KE777',weekdays:'broken'}],'2026-09-09',lookup);
  assert.equal(schedule.ranking.all.totalFlights,1);
  assert.equal(schedule.scheduled[0].flights,1);
  const s={...base,airport:{...base.airport,departuresTrackedToday:null,scheduledBriefing:schedule}};
  const p={...recommendedPreferences('manager'),terminal:'T2'};
  const result=buildPersonalBrief(s,p,'2026-09-09','ko');
  assert.equal(result.cards.find(c=>c.interest==='flights').value,'1편');
  assert.match(result.cards.find(c=>c.interest==='flights').note,/전체 운항편 수나 운항 실적 아님/);
  assert.match(result.cards.find(c=>c.interest==='airlines').value,/1편 \(100%\)/);
  assert.match(result.cards.find(c=>c.interest==='airlines').note,/승객 국적/);
  assert.ok(!buildPersonalBrief(s,{...p,terminal:'T1'},'2026-09-09','ko').cards.some(c=>c.interest==='flights'));
  assert.ok(!buildPersonalBrief({...s,todayKst:'2026-09-10'},p,'2026-09-09','ko').cards.some(c=>c.interest==='flights'));
  const actual={...s,airport:{...s.airport,departuresTrackedToday:12,departuresTrackedTodayByTerminal:{T2:12}}};
  assert.equal(buildPersonalBrief(actual,p,'2026-09-09','ko').cards.find(c=>c.interest==='flights').value,'12편');
});

test('peak hour retains the number of expected passengers as well as time',()=>{
  const s={...base,airport:{...base.airport,peakExpectedTimeBandByTerminal:{T1:{targetStartAt:'2026-09-09T07:00:00+09:00',targetEndAt:'2026-09-09T08:00:00+09:00',expectedPassengers:3210}}}};
  const card=buildPersonalBrief(s,{...recommendedPreferences('manager'),terminal:'T1'},'2026-09-09','ko').cards.find(c=>c.interest==='crowding');
  assert.equal(card.value,'07:00–08:00');
  assert.deepEqual(card.details,['3,210명']);
});

test('an unreadable peak band omits the hour instead of taking the screen down',()=>{
  // buildPersonalBrief runs during render, so a throw here white-screens 내 브리핑.
  // `clock()` used to call new Date(NaN).toISOString(), which is a RangeError,
  // while its sibling kstDay in the same file already returned '' for the same
  // input. Both ends of the band must be readable before a band is stated.
  const p={...recommendedPreferences('manager'),terminal:'T1'};
  for(const targetEndAt of [null,undefined,'','not-a-date','2026-13-45T99:99:99Z',Number.NaN]) {
    const s={...base,airport:{...base.airport,peakExpectedTimeBandByTerminal:{T1:{
      targetStartAt:'2026-09-09T07:00:00+09:00',targetEndAt,expectedPassengers:3210}}}};
    const result=buildPersonalBrief(s,p,'2026-09-09','ko');
    assert.equal(result.cards.some(c=>c.interest==='crowding'),false,String(targetEndAt));
    // The rest of the briefing still renders: one unreadable field is not an outage.
    assert.equal(result.cards.find(c=>c.interest==='passengers')?.value,'123',String(targetEndAt));
  }
  // An unreadable START is refused the same way.
  const badStart={...base,airport:{...base.airport,peakExpectedTimeBandByTerminal:{T1:{
    targetStartAt:'not-a-date',targetEndAt:'2026-09-09T08:00:00+09:00',expectedPassengers:3210}}}};
  assert.equal(buildPersonalBrief(badStart,p,'2026-09-09','ko').cards.some(c=>c.interest==='crowding'),false);
  // A readable band is unchanged.
  const good={...base,airport:{...base.airport,peakExpectedTimeBandByTerminal:{T1:{
    targetStartAt:'2026-09-09T07:00:00+09:00',targetEndAt:'2026-09-09T08:00:00+09:00',expectedPassengers:3210}}}};
  assert.equal(buildPersonalBrief(good,p,'2026-09-09','ko').cards.find(c=>c.interest==='crowding')?.value,'07:00–08:00');
});

test('an unreadable Seoul forecast hour cannot take the briefing down either',()=>{
  for(const targetAt of [null,undefined,'','not-a-date',Number.NaN]) {
    const s={...base,areas:{hongdae:{realtime:null,weather:[],events:[],
      realtimeForecast:[{targetAt,populationMin:300,populationMax:400,congestionLevel:3}]}}};
    const result=buildPersonalBrief(s,recommendedPreferences('manager','hongdae'),'2026-09-09','ko');
    assert.equal(result.cards.some(c=>c.interest==='crowding'),false,String(targetAt));
  }
});

test('the work list leads with the value that produced it, and falls back to the plain sentence',()=>{
  const band={targetStartAt:'2026-09-09T07:00:00+09:00',targetEndAt:'2026-09-09T08:00:00+09:00',expectedPassengers:3210};
  const s={...base,airport:{...base.airport,peakExpectedTimeBandByTerminal:{T1:band}}};
  const p={...recommendedPreferences('manager'),terminal:'T1'};
  const led=buildPersonalBrief(s,p,'2026-09-09','ko').actions;
  // The airport band is the hour with the most expected departure-hall
  // passengers — a head count, not a queue length — so it must not be
  // called 혼잡. The busiest hour for people is not the longest wait.
  assert.equal(led[0],'07:00–08:00 예상 이용객 최다 · 붐비는 시간대 인력 배치와 주요 상품 재고 확인 권장');
  assert.ok(!led[0].includes('혼잡'));
  // Without a published peak the same reader keeps the general sentence
  // rather than a lead invented to fill the gap.
  const bare=buildPersonalBrief({...base,airport:{...base.airport,peakExpectedTimeBandByTerminal:{}}},p,'2026-09-09','ko').actions;
  assert.equal(bare[0],'붐비는 시간대 인력 배치와 주요 상품 재고 확인 권장');
  assert.equal(buildPersonalBrief(s,p,'2026-09-09','en').actions[0],'most expected passengers around 07:00–08:00 · Review staffing and key stock for busy hours');
});

test('rain chance and the official event name reach the work list from their own cards',()=>{
  const s={...base,areas:{hongdae:{
    realtime:null,
    realtimeForecast:[{targetAt:'2026-09-09T18:00:00+09:00',populationMin:300,populationMax:400,congestionLevel:3}],
    weather:[{targetAt:'2026-09-09T11:00:00+09:00',precipitationProbability:80}],
    events:[{title:'홍대 거리공연 주간',eventStart:'2026-09-01',eventEnd:'2026-09-30'},{title:'두 번째 행사',eventStart:'2026-09-09',eventEnd:null}],
  }}};
  const actions=buildPersonalBrief(s,recommendedPreferences('guide','hongdae'),'2026-09-09','ko').actions;
  assert.ok(actions.includes('강수확률 최대 80% · 우천 시 이동 동선과 준비물 확인 권장'));
  assert.ok(actions.includes('홍대 거리공연 주간 · 행사 운영시간과 방문 가능 여부 확인 권장'));
  // One title only: a second official name must not push the advice off screen.
  assert.ok(!actions.some(action=>action.includes('두 번째 행사')));
  // Seoul's band IS chosen by the official congestion level, so here 혼잡
  // is exactly what the source says.
  assert.equal(actions[0],'18:00 예상 혼잡 · 집합 시간과 단체 이동 동선 확인 권장');
});

test('a lead can only repeat a value that is also on a card',()=>{
  const s={...base,areas:{hongdae:{
    realtime:null,realtimeForecast:[{targetAt:'2026-09-09T18:00:00+09:00',populationMin:300,populationMax:400,congestionLevel:3}],
    weather:[{targetAt:'2026-09-09T11:00:00+09:00',precipitationProbability:80}],events:[],
  }}};
  // 'weather' deselected: neither the card nor its number may appear anywhere.
  const p={...recommendedPreferences('guide','hongdae'),interests:['crowding']};
  const result=buildPersonalBrief(s,p,'2026-09-09','ko');
  assert.ok(!JSON.stringify(result).includes('80%'));
  assert.equal(result.actions.length,1);
});
