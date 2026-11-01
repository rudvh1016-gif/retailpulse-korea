import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm's prod/dev classification does not describe a Vite Worker bundle.
export function evaluateAudit(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    return { status: 2, message: 'Dependency audit unavailable; release blocked.' };
  }
  let report;
  try { report = JSON.parse(result.stdout); } catch {
    return { status: 2, message: 'Dependency audit returned invalid JSON; release blocked.' };
  }
  const counts = report?.metadata?.vulnerabilities;
  const levels = ['info', 'low', 'moderate', 'high', 'critical'];
  if (report.error || !counts || !report.vulnerabilities ||
      ![...levels, 'total'].every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0) ||
      levels.reduce((sum, key) => sum + counts[key], 0) !== counts.total ||
      (result.status === 0 && counts.high + counts.critical > 0) ||
      (result.status === 1 && counts.total === 0)) {
    return { status: 2, message: 'Dependency audit report incomplete or inconsistent; release blocked.' };
  }
  const blocking = counts.high + counts.critical;
  return {
    status: blocking ? 1 : 0,
    message: `Dependency audit (including dev/build/runtime): ${JSON.stringify(counts)}. ` +
      (blocking ? `${blocking} high/critical findings; release blocked.` : 'No high/critical findings.'),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--include=dev', '--json', '--audit-level=high', '--fetch-retries=0', '--fetch-timeout=20000'],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
      shell: process.platform === 'win32' });
  const verdict = evaluateAudit(result);
  // Do not echo registry diagnostics (proxy URLs may contain credentials).
  console.log(verdict.message);
  process.exitCode = verdict.status;
}
