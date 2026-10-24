import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  diagnoseShillaExchange, sanitizeShillaExchangeEvidence, SHILLA_DIAGNOSTIC_URL,
  SHILLA_DIAGNOSTIC_MAX_BYTES, SHILLA_DIAGNOSTIC_TIMEOUT_MS,
} from '../scripts/diagnose-shilla-exchange-contract.mjs';

const fixture = name => readFileSync(new URL(`./fixtures/shilla-contract-diagnostic/${name}.html`, import.meta.url), 'utf8');
const widget = fixture('public-widget');
const html = (body = widget, headers = {}) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const run = async response => {
  let calls = 0;
  const result = await diagnoseShillaExchange({ fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://www.shilladfs.com/estore/kr/ko/');
    assert.equal(url, SHILLA_DIAGNOSTIC_URL);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    assert.deepEqual(init.headers, { accept: 'text/html' });
    assert.ok(init.signal instanceof AbortSignal);
    return response;
  } });
  assert.equal(calls, 1);
  return result;
};

test('one hardcoded credential-free GET returns only public enum/numeric/date evidence and metadata', async () => {
  const { ok, report } = await run(html());
  assert.equal(ok, true);
  assert.deepEqual(Object.keys(report), ['httpStatus', 'contentType', 'bodyBytes', 'bodySha256', 'exchangeEvidence']);
  assert.equal(report.httpStatus, 200);
  assert.equal(report.contentType, 'text/html');
  assert.equal(report.bodyBytes, Buffer.byteLength(widget));
  assert.equal(report.bodySha256, createHash('sha256').update(widget).digest('hex'));
  assert.ok(report.exchangeEvidence.some(item => item.classes.includes('sum') && item.rates[0] === '1342.40'));
  assert.ok(report.exchangeEvidence.some(item => item.dates[0] === '2026-10-21'));
  const output = JSON.stringify(report);
  assert.doesNotMatch(output, /PRIVATE|private|session|token|input|script|href|title=|9999|9998|https?:|<|>/i);
});

test('a changed semantic selector can be inspected without printing unknown class or attribute values', () => {
  const evidence = sanitizeShillaExchangeEvidence(fixture('changed-selector'));
  assert.ok(evidence.some(item => item.tag === 'strong' && item.classes[0] === 'value' && item.rates[0] === '1342.40'));
  assert.doesNotMatch(JSON.stringify(evidence), /unknown|private/);
  assert.ok(evidence.some(item => item.label === '오늘의 환율'));
});

test('no arbitrary text, naked product number, script, input, comment or hidden form becomes evidence', () => {
  for (const body of [
    '<div class="exchange">오늘의 환율 account=PRIVATE 123456789</div>',
    '<span class="sum">$1=1,342.40원</span>',
    '<div class="exchange">오늘의 환율<script>$1=1,342.40원</script><input value="$1=1,342.40원"></div>',
    '<!-- <div class="exchange">오늘의 환율 $1=1,342.40원</div> -->',
    '<form><div class="exchange">오늘의 환율 $1=1,342.40원</div></form>',
    '<div class="exchange">오늘의 환율 1342.40</div>',
    '<div class="exchange">오늘의 환율 $10=1342.40원</div>',
    '<div class="exchange">오늘의 환율 $1=1,34.40원</div>',
  ]) {
    const evidence = sanitizeShillaExchangeEvidence(body);
    assert.ok(evidence.every(item => item.rates.length === 0));
    assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE|123456789/);
  }
});

test('only source dates are emitted; malformed dates and unbounded tokens fail closed', () => {
  const evidence = sanitizeShillaExchangeEvidence('<div class="exchange">오늘의 환율 <span class="sum">&#36;1=1,342.40원</span></div>');
  assert.ok(evidence.some(item => item.rates[0] === '1342.40'));
  assert.ok(evidence.every(item => item.dates.length === 0));
  assert.deepEqual(sanitizeShillaExchangeEvidence('<div class="exchange">오늘의 환율 $1=1,342.40원 2026-02-30</div>'), []);
  assert.deepEqual(sanitizeShillaExchangeEvidence('<div>'.repeat(65) + widget + '</div>'.repeat(65)), []);
  assert.deepEqual(sanitizeShillaExchangeEvidence('<i></i>'.repeat(20001) + widget), []);
  assert.deepEqual(sanitizeShillaExchangeEvidence('x'.repeat(SHILLA_DIAGNOSTIC_MAX_BYTES + 1)), []);
  assert.deepEqual(sanitizeShillaExchangeEvidence('<a'.repeat(500000)), []);
  assert.deepEqual(sanitizeShillaExchangeEvidence('<script>unterminated' + widget), []);
});

test('403/429/redirect/server errors stop after one GET without consuming the body or headers', async () => {
  for (const status of [301, 302, 401, 403, 406, 429, 500, 503]) {
    let reads = 0, cancelled = false;
    const response = {
      status, headers: new Headers({ 'content-type': 'text/html; session=PRIVATE', location: 'https://private.test/?token=PRIVATE', 'set-cookie': 'PRIVATE' }),
      body: { getReader() { reads++; throw new Error('MUST_NOT_READ'); }, async cancel() { cancelled = true; } },
    };
    const { ok, report } = await run(response);
    assert.equal(ok, false);
    assert.equal(reads, 0);
    assert.equal(cancelled, true);
    assert.equal(report.bodySha256, null);
    assert.deepEqual(report.exchangeEvidence, []);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE|location|cookie|token/);
  }
});

test('security/login/CAPTCHA pages stop with no public-rate evidence or second request', async () => {
  for (const body of [fixture('security'), '<title>로그인</title>' + widget,
    '<input type="password" value="PRIVATE">' + widget,
    '<div class="g-recaptcha">PRIVATE</div>' + widget,
    '<h1>Access denied</h1>' + widget, '<h1>Login</h1>' + widget, '<p>CAPTCHA</p>' + widget]) {
    const { ok, report } = await run(html(body));
    assert.equal(ok, false);
    assert.deepEqual(report.exchangeEvidence, []);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE|captcha|password|denied/i);
  }
});

test('wrong MIME and encoding do not leak arbitrary headers or malformed bytes', async () => {
  for (const response of [html(widget, { 'content-type': 'application/json; PRIVATE' }),
    html(widget, { 'content-type': 'text/html; charset=PRIVATE' }),
    html(new Uint8Array([0xff, 0xfe]))]) {
    const { ok, report } = await run(response);
    assert.equal(ok, false);
    assert.deepEqual(report.exchangeEvidence, []);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  }
});

test('1 MiB exact body is allowed; declared and streamed oversize cancel with no hash/evidence', async () => {
  assert.equal(SHILLA_DIAGNOSTIC_MAX_BYTES, 1048576);
  const padding = SHILLA_DIAGNOSTIC_MAX_BYTES - Buffer.byteLength(widget) - 7;
  const exact = widget + '<!--' + 'x'.repeat(padding) + '-->';
  assert.equal(Buffer.byteLength(exact), SHILLA_DIAGNOSTIC_MAX_BYTES);
  assert.equal((await run(html(exact))).ok, true);
  const declared = await run(html(widget, { 'content-length': String(SHILLA_DIAGNOSTIC_MAX_BYTES + 1) }));
  assert.equal(declared.ok, false);
  assert.equal(declared.report.bodyBytes, 0);
  assert.equal(declared.report.bodySha256, null);
  let cancelled = false, reads = 0;
  const response = { status: 200, headers: new Headers({ 'content-type': 'text/html' }), body: { getReader() {
    return { async read() { reads++; return { done: false, value: new Uint8Array(SHILLA_DIAGNOSTIC_MAX_BYTES / 2 + 1) }; },
      async cancel() { cancelled = true; }, releaseLock() {} };
  } } };
  const streamed = await run(response);
  assert.equal(streamed.ok, false);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
  assert.ok(streamed.report.bodyBytes <= SHILLA_DIAGNOSTIC_MAX_BYTES);
  assert.equal(streamed.report.bodySha256, null);
  assert.deepEqual(streamed.report.exchangeEvidence, []);
});

test('network errors are redacted and never retried', async () => {
  let calls = 0;
  const result = await diagnoseShillaExchange({ fetchImpl: async () => { calls++; throw new Error('https://private/?token=PRIVATE'); } });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.report.httpStatus, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|token|private/);
});

test('one total deadline covers headers AND streaming, aborts, and does not reset for each chunk', async () => {
  assert.equal(SHILLA_DIAGNOSTIC_TIMEOUT_MS, 12000);
  let calls = 0, signal, cancelled = false;
  const stalled = await diagnoseShillaExchange({ timeoutMs: 10, fetchImpl: async (_, init) => {
    calls++; signal = init.signal; return new Promise(() => {});
  } });
  assert.equal(calls, 1);
  assert.equal(stalled.ok, false);
  assert.equal(signal.aborted, true);
  let reads = 0;
  const streaming = await diagnoseShillaExchange({ timeoutMs: 25, fetchImpl: async (_, init) => {
    calls++; signal = init.signal;
    return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), body: { getReader() {
      return { async read() { reads++; await new Promise(resolve => setTimeout(resolve, 10)); return { done: false, value: new Uint8Array([32]) }; },
        async cancel() { cancelled = true; }, releaseLock() {} };
    } } };
  } });
  assert.equal(calls, 2); // Exactly one in each independent offline fixture invocation.
  assert.equal(streaming.ok, false);
  assert.ok(reads >= 1 && reads <= 3);
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
  assert.equal(streaming.report.bodySha256, null);
});

test('manual workflow stays opt-in, one standard runner, read-only token and no secrets/DB/collector/artifacts', () => {
  const workflow = readFileSync(new URL('../.github/workflows/diagnose-provider-reachability.yml', import.meta.url), 'utf8');
  assert.match(workflow, /default: data_go_kr_network/);
  assert.match(workflow, /inputs\.scope == '' \|\| inputs\.scope == 'data_go_kr_network'/);
  assert.match(workflow, /COUNT=6/);
  assert.match(workflow, /COUNT=2/);
  assert.match(workflow, /COUNT=10/);
  assert.match(workflow, /node scripts\/diagnose-data-go-kr-network\.mjs/);
  const job = workflow.slice(workflow.indexOf('\n  shilla_exchange_contract:')).split('\n  # Temporary,')[0];
  assert.match(job, /if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.scope == 'shilla_exchange_contract' \}\}/);
  assert.match(job, /runs-on: ubuntu-latest/);
  assert.match(job, /contents: read/);
  assert.match(job, /persist-credentials: false/);
  assert.equal((job.match(/node scripts\//g) ?? []).length, 1);
  assert.doesNotMatch(job, /matrix:|secrets\.|environment:|upload-artifact|npm |D1|collect-duty/);
  assert.doesNotMatch(workflow, /\bschedule:|pull_request_target:|push:|workflow_run:/);
  const script = readFileSync(new URL('../scripts/diagnose-shilla-exchange-contract.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...script.matchAll(/^import .+ from '([^']+)'/gm)].map(match => match[1]), ['node:crypto', 'node:url']);
  assert.equal((script.match(/console\./g) ?? []).length, 1);
  assert.match(script, /console\.log\(JSON\.stringify\(report\)\)/);
  assert.match(script, /process\.argv\[2\] !== '--once'/);
  assert.doesNotMatch(script, /process\.env|writeFile|appendFile|setInterval/);
});


test('one-shot PR gate accepts only exact source repo/branch opened on attempt 1, never forks or updates', () => {
  const workflow = readFileSync(new URL('../.github/workflows/diagnose-provider-reachability.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull_request:\n    types: \[opened\]\n    branches: \[main\]/);
  const job = workflow.slice(workflow.indexOf('\n  shilla_exchange_contract_once:'));
  const expression = /if: >-\n([\s\S]*?)    runs-on:/.exec(job)[1].trim();
  // Evaluate the simple conjunction without eval; every clause must be exact equality.
  const clauses = expression.split('&&').map(value => {
    const match = /^(github[\w.]*) == '([^']+)'$/.exec(value.trim());
    assert.ok(match, 'Only literal equality clauses are allowed');
    return [match[1], match[2]];
  });
  assert.equal(clauses.length, 7);
  const baseline = {
    'github.event_name': 'pull_request', 'github.event.action': 'opened', 'github.run_attempt': '1',
    'github.repository': 'rudvh1016-gif/retailpulse-korea',
    'github.event.pull_request.head.repo.full_name': 'rudvh1016-gif/retailpulse-korea',
    'github.event.pull_request.head.ref': 'diagnostic/shilla-exchange-contract-20261021',
    'github.event.pull_request.base.ref': 'main',
  };
  const accepts = values => clauses.every(([key, value]) => values[key] === value);
  assert.equal(accepts(baseline), true);
  for (const [key, value] of [
    ['github.event_name', 'push'], ['github.event_name', 'workflow_dispatch'],
    ['github.event.action', 'synchronize'], ['github.event.action', 'reopened'],
    ['github.run_attempt', '2'], ['github.repository', 'fork/retailpulse-korea'],
    ['github.event.pull_request.head.repo.full_name', 'fork/retailpulse-korea'],
    ['github.event.pull_request.head.ref', 'other-branch'], ['github.event.pull_request.base.ref', 'staging'],
  ]) assert.equal(accepts({ ...baseline, [key]: value }), false, `${key}=${value} must not call source`);
  assert.match(job, /runs-on: ubuntu-latest/);
  assert.match(job, /contents: read/);
  assert.match(job, /persist-credentials: false/);
  assert.match(job, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(job, /matrix:|secrets\.|environment:|upload-artifact|npm |D1|collect-duty/);
  assert.equal((job.match(/node scripts\//g) ?? []).length, 1);
  const hash = createHash('sha256').update(readFileSync(new URL('../scripts/diagnose-shilla-exchange-contract.mjs', import.meta.url))).digest('hex');
  assert.equal(hash, 'e40c42c3f4f466518a7506728cf05c2ba98dd11f3f907e55e14d0e378ebd6fb8');
  assert.match(job, new RegExp(hash + '  scripts/diagnose-shilla-exchange-contract\\.mjs'));
  assert.match(job, /sha256sum --check --status/);
  const beforeProbe = workflow.slice(0, workflow.indexOf('\n  # Temporary,'));
  assert.equal((beforeProbe.match(/if: \$\{\{ github\.event_name == 'workflow_dispatch'/g) ?? []).length, 3);
});
