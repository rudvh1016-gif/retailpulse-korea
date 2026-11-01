import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAudit } from '../scripts/audit-dependencies.mjs';

function report(high = 0, moderate = 0) {
  return { status: high ? 1 : 0, stdout: JSON.stringify({ vulnerabilities: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate, high, critical: 0, total: high + moderate } } }) };
}

test('complete audit passes clean/moderate trees and blocks high findings', () => {
  assert.equal(evaluateAudit(report()).status, 0);
  assert.equal(evaluateAudit(report(0, 1)).status, 0);
  assert.equal(evaluateAudit(report(1)).status, 1);
});

test('outages, malformed reports, missing counts and process failures block release', () => {
  for (const result of [
    { status: 1, stdout: '{"error":{"code":"E503"}}' },
    { status: 0, stdout: 'not json' },
    { status: 0, stdout: '{"metadata":{"vulnerabilities":{}}}' },
    { ...report(), error: new Error('timeout') },
    { ...report(), signal: 'SIGTERM' },
    { ...report(), status: 2 },
    { ...report(), status: 1 },
    { ...report(1), status: 0 },
  ]) assert.equal(evaluateAudit(result).status, 2);
});
