/** Follow the actual reusable edge; do not count a gated repair as a cadence owner. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { load } = createRequire(import.meta.url)('js-yaml');

/** @param {string} workflow @returns {string} */
export function expandRealtimeCadence(workflow) {
  if (!workflow.includes('uses: ./.github/workflows/collect-realtime-cycle.yml')) return workflow;
  const root = load(workflow);
  assert.deepEqual(root.permissions, { contents: 'read' });
  assert.equal(root.concurrency, undefined);
  assert.equal(root.jobs.collect.uses, './.github/workflows/collect-realtime-cycle.yml');
  assert.deepEqual(root.jobs.collect.concurrency, { group: 'production-collector-realtime', 'cancel-in-progress': false });
  const repair = root.jobs.airport_midnight_recovery;
  assert.equal(repair.uses, './.github/workflows/collect-attempt.yml');
  assert.equal(repair.with.sources, 'airport_recent');
  assert.equal(repair.with.a1_midnight_recovery, true);
  assert.equal(repair.with.a1_midnight_caller, 'airport_midnight_recovery');
  assert.equal(repair.with.a1_rescan_today, false);
  assert.equal(repair.with.a1_max_requests, '125');
  assert.match(repair.if, /needs\.airport_today_coverage\.outputs\.a1_recovery_eligible == 'true'/);
  assert.match(repair.if, /github\.ref == 'refs\/heads\/main'/);
  assert.deepEqual(repair.concurrency, { group: 'production-collector', 'cancel-in-progress': false });
  const cycle = readFileSync(new URL('../../.github/workflows/collect-realtime-cycle.yml', import.meta.url), 'utf8');
  const parsedCycle = load(cycle);
  assert.deepEqual(Object.keys(parsedCycle.on), ['workflow_call']);
  assert.deepEqual(parsedCycle.permissions, { contents: 'read' });
  assert.equal(parsedCycle.concurrency, undefined);
  assert.deepEqual(Object.keys(parsedCycle.jobs), ['collect', 'retry_congestion']);
  for (const job of Object.values(parsedCycle.jobs)) assert.equal(job.concurrency, undefined);
  const start = workflow.indexOf('  airport_midnight_recovery:');
  const end = workflow.indexOf('  # Reuse the existing trigger;', start);
  assert.ok(start >= 0 && end > start, 'controlled repair must have an explicit bounded block');
  return workflow.slice(0, start) + workflow.slice(end) + '\n' + cycle;
}
