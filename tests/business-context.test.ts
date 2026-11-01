import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BUSINESS_PREFERENCES, businessScopeParams, parseBusinessPreferences, resolveBusinessContext, sharedBusinessPlace, type BusinessPreferences } from '../lib/business-preferences';

const savedSeoul: BusinessPreferences = { version: 1, place: 'area', terminal: 'T2', side: 'WEST', hours: { open: '09:00', close: '18:00' } };

test('a missing or unreadable store starts at the airport without manufacturing a saved choice', () => {
  assert.equal(parseBusinessPreferences(null), null);
  assert.equal(parseBusinessPreferences('{'), null);
  assert.equal(DEFAULT_BUSINESS_PREFERENCES.place, 'airport');
  assert.equal(DEFAULT_BUSINESS_PREFERENCES.hours, null);
  assert.deepEqual(resolveBusinessContext(DEFAULT_BUSINESS_PREFERENCES, 'myeongdong', null).place, { kind: 'airport', terminal: 'T1', side: null });
});

test('an airport link overrides this visit while preserving an explicitly saved Seoul store', () => {
  const before = structuredClone(savedSeoul);
  const scope = sharedBusinessPlace(new URLSearchParams('place=airport&terminal=T1&side=EAST'));
  const current = resolveBusinessContext(savedSeoul, 'hongdae', scope);
  assert.deepEqual(current.place, { kind: 'airport', terminal: 'T1', side: 'EAST' });
  assert.equal(current.preferences.place, 'airport');
  assert.deepEqual(current.preferences.hours, before.hours);
  assert.deepEqual(savedSeoul, before);
  assert.deepEqual(resolveBusinessContext(savedSeoul, 'hongdae', null).place, { kind: 'area', area: 'hongdae' });
});

test('explicit Seoul links, including existing area links, take precedence without changing airport preferences', () => {
  const saved: BusinessPreferences = { ...savedSeoul, place: 'airport' };
  for (const query of ['place=area&area=seongsu', 'area=seongsu']) {
    const scope = sharedBusinessPlace(new URLSearchParams(query));
    const current = resolveBusinessContext(saved, 'hongdae', scope);
    assert.deepEqual(current.place, { kind: 'area', area: 'seongsu' });
    assert.equal(current.preferences.place, 'area');
    assert.equal(saved.place, 'airport');
  }
});

test('business entry and shared links use one validated scope vocabulary', () => {
  const scopes = [
    { kind: 'airport', terminal: 'T2', side: 'WEST' },
    { kind: 'airport', terminal: 'T1', side: null },
    { kind: 'area', area: 'hongdae' },
  ] as const;
  for (const scope of scopes) assert.deepEqual(sharedBusinessPlace(businessScopeParams(scope)), scope);
  for (const query of ['place=airport&terminal=T3', 'place=area&area=unknown', 'place=moon&area=hongdae']) assert.equal(sharedBusinessPlace(new URLSearchParams(query)), null);
});
