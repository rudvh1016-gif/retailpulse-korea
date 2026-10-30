import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** Read-only discovery: no browser, preview server or provider is started. */
export function browserTestIds(report) {
  assert.equal(report.errors?.length ?? 0, 0, 'Browser test discovery failed');
  const ids = [];
  function walk(suite) {
    for (const spec of suite.specs ?? []) for (const project of spec.tests ?? []) {
      assert.equal(typeof spec.id, 'string', 'Missing browser test identity');
      ids.push(`${spec.id}:${project.projectId ?? project.projectName}`);
    }
    for (const child of suite.suites ?? []) walk(child);
  }
  for (const suite of report.suites ?? []) walk(suite);
  return ids;
}

/** Every discovered case must occur in exactly one of the launched shards. */
export function assertBrowserShardCoverage(full, parts) {
  const expected = browserTestIds(full), actual = parts.flatMap(browserTestIds);
  assert.ok(expected.length > 0 && parts.length > 0, 'Empty browser inventory');
  assert.equal(new Set(expected).size, expected.length, 'Duplicate full-suite identity');
  assert.equal(new Set(actual).size, actual.length, 'Browser case assigned to multiple shards');
  assert.deepEqual([...actual].sort(), [...expected].sort(), 'Missing or unexpected browser cases');
  return {tests: expected.length, perShard: parts.map(part => browserTestIds(part).length)};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const shards = [1, 2, 3, 4];
  const discover = extra => JSON.parse(execFileSync(process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json', ...extra],
    {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 90_000}));
  const coverage = assertBrowserShardCoverage(discover([]), shards.map(index => discover([`--shard=${index}/${shards.length}`])));
  // The actual CI matrix consumes this validated list; a missing inventory or
  // failed discovery cannot silently launch a subset and earn a green workflow.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `shards=${JSON.stringify(shards.map(shard => ({shard, total: shards.length})))}\n`);
  console.log(JSON.stringify({browserInventory: 'COMPLETE_NO_DUPLICATES', ...coverage, shards}));
}
