/** Public GitHub metadata only: no token, provider, D1, dispatch or writes. */
import {appendFile, readFile, readdir} from 'node:fs/promises';
import {readWorkflowFacts} from '../lib/scheduler-truth';
import {evaluateScheduleTimeliness, type ScheduleRun} from '../lib/schedule-timeliness';

const root = new URL('../.github/workflows/', import.meta.url);
const checkedAt = new Date().toISOString();
const reports = [];
for (const file of (await readdir(root)).filter(file => /^collect-[a-z-]+\.yml$/.test(file)).sort()) {
  const facts = readWorkflowFacts(file, await readFile(new URL(file, root), 'utf8'));
  if (!facts.crons.length) continue; // Worker-owned alarms are deliberately not inferred from dispatch runs.
  try {
    // One page / workflow / existing cycle. No retries and no credentials.
    const url = `https://api.github.com/repos/rudvh1016-gif/retailpulse-korea/actions/workflows/${file}/runs?event=schedule&per_page=5`;
    const response = await fetch(url, {signal: AbortSignal.timeout(8_000), headers: {accept: 'application/vnd.github+json'}});
    if (!response.ok) throw new Error('metadata_unavailable');
    const body = await response.json() as {workflow_runs?: ScheduleRun[]};
    if (!Array.isArray(body.workflow_runs) || body.workflow_runs.some(run =>
      !Number.isSafeInteger(run.id) || typeof run.created_at !== 'string' || run.event !== 'schedule')) throw new Error('invalid_metadata');
    reports.push({workflow: file, ...evaluateScheduleTimeliness(facts.crons, body.workflow_runs, checkedAt)});
  } catch {
    reports.push({workflow: file, state: 'UNKNOWN', reason: 'public GitHub metadata unavailable, invalid or timed out; no retry'});
  }
}
const report = {checkedAt, monitorExecution: reports.length ? 'COMPLETED' : 'INCOMPLETE',
  scope: 'GitHub-native collector schedule creation only; not independent outage monitoring or source health',
  automaticRecoveryAllowed: false, reports};
console.log(JSON.stringify(report, null, 2));
const attention = reports.filter(row => ['UNKNOWN', 'OVERDUE', 'LATE_CREATED'].includes(row.state));
if (process.env.GITHUB_ACTIONS === 'true') {
  for (const row of attention) console.log(`::warning title=Collector schedule observation::${row.workflow}: ${row.state}; inspect schedule evidence separately from collector success`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `\n### Collector schedule timeliness\n\nChecked ${checkedAt}. Read-only; no recovery dispatched.\n\n` +
    reports.map(row => `- ${row.workflow}: **${row.state}**`).join('\n') +
    '\n\nUNKNOWN is unmeasured. Nominal-slot delay is a lower bound, not a proven cause. Platform outage coverage remains open.\n');
}
if (!reports.length) process.exitCode = 1;
