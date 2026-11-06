import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {evaluateScheduleTimeliness, previousScheduleSlot} from '../lib/schedule-timeliness.ts';

const run = (created_at, rest={}) => ({id: 1, event:'schedule', created_at, run_started_at:created_at,
  status:'completed', conclusion:'success', html_url:'https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/1', ...rest});
test('observed A1 and daily delays remain visible even after successful execution', () => {
  const early = evaluateScheduleTimeliness('7 15 * * *', [run('2026-11-05T21:26:46Z')], '2026-11-06T07:00:00Z');
  assert.equal(early.state, 'LATE_CREATED');
  assert.equal(early.creationDelayLowerBoundMs, (6*3600+19*60+46)*1000);
  assert.equal(early.runStartDelayMs, 0);
  assert.equal(early.runConclusion, 'success');
  const daily = evaluateScheduleTimeliness('7 21 * * *', [run('2026-11-06T01:28:31Z')], '2026-11-06T07:00:00Z');
  assert.equal(daily.state, 'LATE_CREATED');
  assert.equal(daily.creationDelayLowerBoundMs, (4*3600+21*60+31)*1000);
});
test('yesterday alive does not hide an overdue daily slot; grace has a boundary', () => {
  const rows = [run('2026-11-04T21:08:00Z')];
  assert.equal(evaluateScheduleTimeliness('7 21 * * *', rows,'2026-11-05T21:37:00Z').state,'AWAITING_SLOT');
  assert.equal(evaluateScheduleTimeliness('7 21 * * *', rows,'2026-11-05T21:37:01Z').state,'OVERDUE');
});
test('manual, invalid, absent and future executions never prove a scheduled slot', () => {
  for (const rows of [[],[run('bad')],[run('2026-11-06T01:00:00Z',{event:'workflow_dispatch'})], [run('2027-01-01T00:00:00Z')]]) {
    assert.equal(evaluateScheduleTimeliness('7 21 * * *',rows,'2026-11-06T07:00:00Z').state,'UNKNOWN');
  }
});
test('run start and creation delay are independent; no false all-clear from recent failure', () => {
  const result = evaluateScheduleTimeliness('7 21 * * *',[run('2026-11-05T21:08:00Z',{
    run_started_at:'2026-11-05T22:08:00Z',conclusion:'failure'})],'2026-11-06T07:00:00Z');
  assert.equal(result.state,'RECENT_SCHEDULE_RUN');
  assert.equal(result.runStartDelayMs,3600000);
  assert.equal(result.runConclusion,'failure');
  assert.match(result.limitation,/data health are separate/);
});
test('UTC boundaries, weekly wrap and unsupported cron shapes stay explicit', () => {
  assert.equal(previousScheduleSlot('7 15 * * *','2026-11-05T15:06:59Z'),'2026-11-04T15:07:00.000Z');
  assert.equal(previousScheduleSlot('7 22 * * 6','2026-11-06T12:00:00Z'),'2026-10-31T22:07:00.000Z');
  for (const cron of ['*/5 * * * *','7 21 1 * *','60 21 * * *','7 24 * * *','7 21 * * 7','nonsense']) {
    assert.equal(previousScheduleSlot(cron,'2026-11-06T12:00:00Z'),null);
  }
  assert.equal(previousScheduleSlot('7 21 * * *','bad'),null);
});
test('multiple cron expressions are one workflow union, not independent run evidence', () => {
  const result = evaluateScheduleTimeliness(['10,30 8 * * *','0 9,10 * * *'],
    [run('2026-11-06T09:01:00Z')], '2026-11-06T09:05:00Z');
  assert.equal(result.expectedSlot,'2026-11-06T09:00:00.000Z');
  assert.equal(result.creationDelayLowerBoundMs,60000);
  assert.equal(result.state,'RECENT_SCHEDULE_RUN');
  assert.equal(evaluateScheduleTimeliness(['7 21 * * *','unsupported'],[], '2026-11-06T09:05:00Z').state,'UNKNOWN');
});
test('observer uses existing primary cycle only, without secrets, dispatch, retries or new schedule', async () => {
  const yaml = await readFile(new URL('../.github/workflows/collect-realtime-cycle.yml', import.meta.url),'utf8');
  assert.equal((yaml.match(/tsx scripts\/check-schedule-timeliness.ts/g)||[]).length,1);
  const script = await readFile(new URL('../scripts/check-schedule-timeliness.ts',import.meta.url),'utf8');
  assert.doesNotMatch(script,/process\.env\.(?:GITHUB_TOKEN|GH_TOKEN|CLOUDFLARE|DATA_GO)|method:\s*['"]POST/);
  assert.match(script,/per_page=5/);
  assert.match(script,/AbortSignal.timeout\(8_000\)/);
});
