import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIMITS, sha256, allowanceSemanticHash, validateQuantity, validateManifest,
  validatePreviewDataset, assessObservation, inspectSourceBytes, checkSource,
} from '../lib/customs-allowance-check.mjs';

const original = await readFile(new URL('./fixtures/customs-allowance-check/unchanged.html', import.meta.url));
const changed = await readFile(new URL('./fixtures/customs-allowance-check/changed.html', import.meta.url));
const SOURCE_URL = 'https://www.customs.go.jp/kaigairyoko/menzei.htm';
const time = '2026-10-20T00:00:00.000Z';
const lastGood = { verifiedAt: '2026-10-01', facts: { tobacco: 0, goods: null }, publicText: 'Last reviewed text' };
const baseline = { url: SOURCE_URL, sha256: sha256(original), reviewedAt: '2026-10-01' };
const now = () => new Date(time);

function fixture({ reviewed = true, base = baseline, ...policy } = {}) {
  const source = {
    id: 'JP-01', jurisdiction: 'JP', label: 'Fixture only', url: SOURCE_URL, format: 'html',
    accessReview: reviewed ? { url: SOURCE_URL, automatedReadAllowed: true,
      evidenceUrl: 'https://www.customs.go.jp/', reviewedAt: '2026-10-01', minIntervalHours: 168 } : null,
    baseline: structuredClone(base),
  };
  return { version: 1, automaticCollectionEnabled: false, publicationEnabled: false,
    policy: { ...LIMITS, minIntervalHours: 168, ...policy }, allowedHosts: ['www.customs.go.jp'], sources: [source] };
}
function preview() {
  return { countries: [{ id: 'JP', scope: 'Fixture: ordinary travelers only', checkedAt: '2026-10-01', verifiedAt: '2026-10-01',
    effectiveDate: null, effectiveLabel: 'Unknown',
    conditions: [{ id: 'age', label: 'Age', options: [{ id: 'adult', label: 'Adult' }, { id: 'unknown', label: 'Unknown' }] }],
    results: [{ when: { age: ['adult'] }, label: 'Fixture', facts: [{ label: 'Tobacco', value: '0 cigarettes' }, { label: 'Goods', value: null }], notes: ['A or B, not A and B'] }],
    notes: ['Residence is not nationality'], sources: [{ label: 'Fixture', url: SOURCE_URL }] }] };
}
const response = (body = original, options = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...options });
async function run(fetchImpl, options = {}, manifest = fixture()) {
  return checkSource(manifest.sources[0], manifest, { fetchImpl, now, lastGood, ...options });
}

test('manifest is preparation-only; invalid URL, source, baseline and budget fail closed', () => {
  assert.equal(validateManifest(fixture()).automaticCollectionEnabled, false);
  for (const mutate of [
    m => { m.publicationEnabled = true; },
    m => { m.automaticCollectionEnabled = true; },
    m => { m.policy.maxRequests = 25; },
    m => { m.policy.maxBytes = LIMITS.maxBytes + 1; },
    m => { m.sources[0].url = 'https://www.customs.go.jp.evil.test/'; },
    m => { m.sources[0].url = 'http://www.customs.go.jp/'; },
    m => { m.sources[0].url = 'https://password@www.customs.go.jp/'; },
    m => { m.sources[0].baseline.url = 'https://www.customs.go.jp/other'; },
    m => { m.sources[0].baseline.sha256 = 'not-a-hash'; },
    m => { m.sources[0].accessReview.minIntervalHours = 1; },
  ]) {
    const manifest = fixture();
    mutate(manifest);
    assert.throws(() => validateManifest(manifest));
  }
});

test('known zero, unknown null and positive quantity are distinct', () => {
  const known = { state: 'known', amount: 0, unit: 'cigarettes', sourceQuote: 'No concession', zeroExplicitlyConfirmed: true };
  assert.equal(validateQuantity(known), true);
  assert.equal(validateQuantity({ ...known, zeroExplicitlyConfirmed: false }), false);
  assert.equal(validateQuantity({ ...known, amount: null }), false);
  assert.equal(validateQuantity({ state: 'unknown', amount: null }), true);
  assert.equal(validateQuantity({ state: 'unknown', amount: 0 }), false);
  assert.equal(validateQuantity({ ...known, amount: 200 }), true);
  assert.equal(validateQuantity({ ...known, amount: -1 }), false);
  assert.equal(validateQuantity({ ...known, amount: NaN }), false);
  assert.equal(validateQuantity({ ...known, amount: 200, unit: '' }), false);
});

test('preview references and official URLs are checked; unknown fact stays null', () => {
  const dataset = preview(), manifest = fixture();
  assert.deepEqual(validatePreviewDataset(dataset, manifest), []);
  assert.equal(dataset.countries[0].results[0].facts[1].value, null);
  dataset.countries[0].results[0].when.age = ['nonexistent'];
  assert.ok(validatePreviewDataset(dataset, manifest).includes('JP:RESULT_REFERENCE_INVALID'));
  dataset.countries[0].sources = [];
  assert.ok(validatePreviewDataset(dataset, manifest).includes('JP:SOURCE_MANIFEST_MISMATCH'));
});

test('semantic hash excludes repeated check clocks, retains dates, scope, alternatives and null', () => {
  const country = preview().countries[0], hash = allowanceSemanticHash(country);
  assert.equal(allowanceSemanticHash({ ...country, checkedAt: time, verifiedAt: time }), hash);
  for (const update of [
    { scope: 'Different residents' }, { effectiveDate: '2027-01-01' },
    { notes: ['A and B'] }, { conditions: [] }, { results: [] },
  ]) assert.notEqual(allowanceSemanticHash({ ...country, ...update }), hash);
  const clone = structuredClone(country);
  clone.results[0].facts[1].value = '0';
  assert.notEqual(allowanceSemanticHash(clone), hash);
});

test('unchanged source never refreshes verification or grants publication', async () => {
  const result = await run(async () => response());
  assert.equal(result.state, 'UNCHANGED_SOURCE');
  assert.equal(result.checkedAt, time);
  assert.deepEqual(result.lastGood, lastGood);
  assert.notEqual(result.lastGood, lastGood);
  assert.equal(result.mayPublish, false);
  assert.equal(result.legalInterpretationVerified, false);
  assert.equal(result.regulationChanged, null);
  assert.equal(result.automaticCollectionEnabled, false);
});

test('changed source and initial baseline are review candidates, not changed regulations', async () => {
  assert.equal((await run(async () => response(changed))).state, 'SOURCE_CHANGED_REVIEW_REQUIRED');
  assert.equal((await run(async () => response(), {}, fixture({ base: null }))).state, 'BASELINE_REVIEW_REQUIRED');
  assert.deepEqual((await run(async () => response(changed))).lastGood, lastGood);
});

test('304 cannot rewrite last-good or verification; unsolicited network 304 is an error', async () => {
  const source = fixture().sources[0];
  const result = assessObservation(source, { kind: 'not-modified', observedAt: time }, lastGood);
  assert.equal(result.state, 'NOT_MODIFIED_RESPONSE');
  assert.deepEqual(result.lastGood, lastGood);
  assert.equal(result.mayPublish, false);
  assert.equal((await run(async () => new Response(null, { status: 304 }))).reason, 'UNEXPECTED_304');
});

test('unreviewed access, request ceiling and wrong source perform no fetch', async () => {
  let calls = 0;
  const noFetch = async () => { calls += 1; throw new Error('must not run'); };
  assert.equal((await run(noFetch, {}, fixture({ reviewed: false }))).reason, 'ACCESS_REVIEW_REQUIRED');
  assert.equal((await run(noFetch, { budget: { requests: 24 } })).reason, 'REQUEST_LIMIT');
  const manifest = fixture();
  await assert.rejects(checkSource({ ...manifest.sources[0], url: 'https://evil.test/' }, manifest, { fetchImpl: noFetch }));
  assert.equal(calls, 0);
});

test('403 and 429 are collection-blocked and not retried', async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    const result = await run(async () => { calls += 1; return response('blocked', { status }); });
    assert.equal(result.state, 'COLLECTION_BLOCKED');
    assert.equal(result.reason, `HTTP_${status}`);
    assert.deepEqual(result.lastGood, lastGood);
    assert.equal(calls, 1);
  }
});

test('redirect, including same-host redirect, is not followed', async () => {
  let calls = 0;
  const result = await run(async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    calls += 1;
    return new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } });
  });
  assert.equal(result.reason, 'REDIRECT_BLOCKED');
  assert.equal(calls, 1);
});

test('oversized declared and streamed responses are rejected', async () => {
  const manifest = fixture({ maxBytes: 100 });
  const declared = await run(async () => response(original, { headers: { 'content-length': '101', 'content-type': 'text/html' } }), {}, manifest);
  assert.equal(declared.reason, 'RESPONSE_LIMIT');
  assert.equal((await run(async () => response(original), {}, manifest)).reason, 'RESPONSE_LIMIT');
});

test('timeout includes delayed headers and delayed streamed body', async () => {
  const manifest = fixture({ timeoutMs: 10 });
  assert.equal((await run(async () => new Promise(() => {}), {}, manifest)).reason, 'TIMEOUT');
  assert.equal((await run(async () => new Response(new ReadableStream({ start() {} }), {
    headers: { 'content-type': 'text/html' },
  }), {}, manifest)).reason, 'TIMEOUT');
});

test('200 challenge shell, incomplete HTML, unsupported charset and wrong MIME fail', async () => {
  const cases = [
    [response('<html><head><title>Just a moment</title></head><body>challenge</body></html>'), 'BLOCK_PAGE'],
    [response('<html><body>incomplete'), 'INCOMPLETE_HTML'],
    [response(original, { headers: { 'content-type': 'text/html; charset=gbk' } }), 'UNSUPPORTED_ENCODING'],
    [response(original, { headers: { 'content-type': 'application/json' } }), 'FORMAT_MISMATCH'],
  ];
  for (const [res, expected] of cases) {
    const result = await run(async () => res);
    assert.equal(result.reason, expected);
    assert.deepEqual(result.lastGood, lastGood);
  }
});

test('PDF observation hashes bytes only; no facts are extracted or approved', () => {
  const source = { ...fixture().sources[0], format: 'pdf' };
  const result = inspectSourceBytes(source, Buffer.from('%PDF-1.7\nfixture only\n%%EOF'), 'application/pdf');
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.parsedLegalFacts, false);
  assert.throws(() => inspectSourceBytes(source, original, 'application/pdf'), /FORMAT_MISMATCH/);
  assert.throws(() => inspectSourceBytes(source, Buffer.from('%PDF-1.7\ncut short'), 'application/pdf'), /INCOMPLETE_PDF/);
});

test('provider failure details are reduced to safe codes and preserve zero/null', async () => {
  const result = await run(async () => { throw new Error('https://example.test/?token=secret'); });
  assert.equal(result.reason, 'NETWORK_ERROR');
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal(result.lastGood.facts.tobacco, 0);
  assert.equal(result.lastGood.facts.goods, null);
});

test('real manifest has 12 source jurisdictions but zero access approvals/baselines', async () => {
  const manifest = JSON.parse(await readFile(new URL('../config/customs-allowance-sources.json', import.meta.url), 'utf8'));
  validateManifest(manifest);
  assert.deepEqual([...new Set(manifest.sources.map(source => source.jurisdiction))].sort(),
    ['AU', 'CA', 'CN', 'HK', 'JP', 'MY', 'PH', 'SG', 'TH', 'TW', 'US', 'VN']);
  assert.equal(manifest.sources.length, 60);
  assert.ok(manifest.sources.every(source => source.accessReview === null && source.baseline === null));
});
