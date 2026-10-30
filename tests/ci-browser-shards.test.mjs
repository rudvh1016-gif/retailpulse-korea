import assert from 'node:assert/strict';
import test from 'node:test';
import {assertBrowserShardCoverage} from '../scripts/check-browser-shards.mjs';
const report = ids => ({errors: [], suites: [{suites: [{specs: ids.map(id => ({id, tests: [{projectId: 'chromium'}]}))}]}]});
test('partitioned browser inventory preserves every case exactly once', () => {
  assert.deepEqual(assertBrowserShardCoverage(report(['a', 'b', 'c', 'd']), [report(['b']), report(['a', 'c']), report(['d'])]), {tests: 4, perShard: [1, 2, 1]});
});
test('missing, duplicate and foreign cases cannot pass a partitioned inventory', () => {
  assert.throws(() => assertBrowserShardCoverage(report(['a', 'b']), [report(['a'])]), /Missing/);
  assert.throws(() => assertBrowserShardCoverage(report(['a', 'b']), [report(['a', 'b']), report(['a'])]), /multiple shards/);
  assert.throws(() => assertBrowserShardCoverage(report(['a', 'b']), [report(['a', 'c'])]), /unexpected/);
});
test('empty or failed discovery cannot produce a successful browser gate', () => {
  assert.throws(() => assertBrowserShardCoverage(report([]), [report([])]), /Empty/);
  assert.throws(() => assertBrowserShardCoverage({...report(['a']), errors: [{}]}, [report(['a'])]), /discovery failed/);
});
