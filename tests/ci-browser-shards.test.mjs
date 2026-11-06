import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
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

test('notice journey is a strict pre-release and exact-revision production completion gate',()=>{
 const ci=readFileSync('.github/workflows/ci.yml','utf8'),deploy=readFileSync('.github/workflows/deploy-cloudflare.yml','utf8');
 assert.match(ci,/npx playwright test e2e\/airport-period-insights\.spec\.ts e2e\/update-notice\.spec\.ts/);
 const gate=deploy.split('- name: Verify actual notice click reaches visible passenger results')[1]?.split('- name: Save notice release-gate evidence')[0];
 assert.ok(gate,'The deployed notice click must be verified before deployment can complete');
 assert.match(gate,/github\.event_name == 'workflow_run' \|\| inputs\.stage == 'production'/);
 assert.match(gate,/--config playwright\.production\.config\.ts e2e-production\/notice-passenger-journey\.spec\.ts/);
 assert.doesNotMatch(gate,/continue-on-error|\|\| true/);
 assert.ok(deploy.indexOf('Record exactly the revision deployed by this run')<deploy.indexOf('Verify actual notice click reaches visible passenger results'));
 const production=readFileSync('playwright.production.config.ts','utf8');
 assert.match(production,/production-revision-setup\.mjs/);assert.match(production,/testDir: "\.\/e2e-production"/);
});
