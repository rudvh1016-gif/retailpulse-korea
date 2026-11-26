import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyAccountReleasePublic} from '../scripts/verify-account-release-public.mjs';

const origin = 'https://example.invalid';
const privacyPath = '/ko/privacy';
const privacyVersion = 'reviewed-policy-version';
const privateHeaders = {'cache-control': 'private, no-store, max-age=0', 'referrer-policy': 'no-referrer'};
const inputs = {mode: 'account', origin, privacyPath, privacyVersion};
const html = (value, status = 200) => new Response(value, {status, headers: {'content-type': 'text/html; charset=utf-8'}});
const json = (value, status = 200, extra = {}) => Response.json(value, {status, headers: {...privateHeaders, ...extra}});
const enabled = {enabled: true, authenticated: false, privacyVersion};

function fixture(overrides = {}) {
  const requests = [];
  const responses = {
    '/ko': () => html(`<footer><a href="${privacyPath}">개인정보처리방침</a></footer>`),
    [privacyPath]: () => html('<main><h1>개인정보처리방침</h1></main>'),
    '/ko/account': () => html('<main><h1>내 계정</h1></main>'),
    '/api/account/status': () => json(enabled),
    '/api/account/state': () => json({error: 'UNAUTHENTICATED'}, 401),
    ...overrides,
  };
  return {requests, async fetcher(url, options) {
    requests.push({url, options});
    if (!responses[url.pathname]) throw Error('Unexpected path');
    return responses[url.pathname]();
  }};
}

test('public account verification inspects only five anonymous same-origin GETs', async () => {
  const {requests, fetcher} = fixture();
  const result = await verifyAccountReleasePublic(inputs, fetcher);
  assert.equal(result.publicChecksPassed, true);
  assert.deepEqual(result.checks.privateStateRejected, {httpStatus: 401, verified: true});
  assert.deepEqual(requests.map(request => request.url.pathname).sort(), ['/api/account/state', '/api/account/status', '/ko', '/ko/account', privacyPath]);
  for (const {url, options} of requests) {
    assert.equal(url.origin, origin);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, {'cache-control': 'no-cache'});
  }
});

test('policy can be proven independently while no account routes are enabled', async () => {
  const {requests, fetcher} = fixture();
  const result = await verifyAccountReleasePublic({mode: 'policy', origin, privacyPath}, fetcher);
  assert.equal(result.publicChecksPassed, true);
  assert.deepEqual(requests.map(request => request.url.pathname).sort(), ['/ko', privacyPath]);
});

test('hidden homepage link, non-policy fallback and unlaunched account are not positive evidence', async () => {
  const {fetcher} = fixture({
    '/ko': () => html(`<footer hidden><a href="${privacyPath}">개인정보처리방침</a></footer><script>const link='<a href="${privacyPath}">privacy</a>';</script>`),
    [privacyPath]: () => html('<script>console.log("policy")</script>'),
    '/ko/account': () => html('<main><h1>찾을 수 없음</h1></main>', 404),
    '/api/account/status': () => json({error: 'ACCOUNT_DISABLED'}, 404),
    '/api/account/state': () => json({error: 'ACCOUNT_DISABLED'}, 404),
  });
  const result = await verifyAccountReleasePublic(inputs, fetcher);
  assert.equal(result.publicChecksPassed, false);
  assert.ok(Object.values(result.checks).every(check => !check.verified));
  assert.equal(result.checks.signedOutStatus.httpStatus, 404);
});

test('status shape, policy version, caching and unexpected sessions fail closed without printing the reply', async () => {
  for (const response of [
    () => json({...enabled, privacyVersion: 'older-version'}),
    () => json({...enabled, unexpected: 'private-raw-marker'}),
    () => json({...enabled, authenticated: true}),
    () => json(enabled, 200, {'cache-control': 'public, max-age=180'}),
    () => json(enabled, 200, {'set-cookie': 'unexpected=private-raw-marker'}),
    () => {throw Error('private-raw-marker');},
  ]) {
    const {fetcher} = fixture({'/api/account/status': response});
    const result = await verifyAccountReleasePublic(inputs, fetcher);
    assert.equal(result.publicChecksPassed, false);
    assert.equal(result.checks.signedOutStatus.verified, false);
    assert.doesNotMatch(JSON.stringify(result), /private-raw-marker/);
  }
});

test('invalid inputs never start a request', async () => {
  const {requests, fetcher} = fixture();
  for (const change of [{origin: 'http://example.invalid'}, {origin: `${origin}/extra`},
    {privacyPath: '//example.invalid/privacy'}, {privacyPath: '/a/../../privacy'}, {privacyVersion: undefined}]) {
    await assert.rejects(verifyAccountReleasePublic({...inputs, ...change}, fetcher));
  }
  assert.equal(requests.length, 0);
});
