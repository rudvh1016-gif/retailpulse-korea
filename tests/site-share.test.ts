import assert from 'node:assert/strict';
import test from 'node:test';
import { copySiteLink, shareSiteLink, siteShareUrl } from '../lib/site-share';

test('public links keep the current language, without settings or tracking parameters', () => {
  for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
    assert.equal(siteShareUrl('https://koretaildata.com/more?terminal=T2#preferences', lang), `https://koretaildata.com/${lang}`);
  }
});

const data = { title: 'KORETAIL', text: 'Airport information', url: 'https://koretaildata.com/ko' };
test('native sharing starts synchronously with the URL and does not also copy', async () => {
  let started = false;
  const browser = {
    async share(received: ShareData) { started = true; assert.equal(this, browser); assert.deepEqual(received, data); },
    clipboard: { async writeText() { assert.fail('native success must not overwrite the clipboard'); } },
  };
  const result = shareSiteLink(data, browser);
  assert.equal(started, true);
  assert.equal(await result, 'shared');
});
test('native cancellation preserves the clipboard', async () => {
  assert.equal(await shareSiteLink(data, {
    async share() { throw new DOMException('cancelled', 'AbortError'); },
    clipboard: { async writeText() { assert.fail('cancel must not copy'); } },
  }), 'cancelled');
});
test('unsupported or denied native share copies exactly the public URL', async () => {
  for (const share of [undefined, async () => { throw new DOMException('denied', 'NotAllowedError'); }]) {
    let copied = '';
    assert.equal(await shareSiteLink(data, { share, clipboard: { async writeText(value) { copied = value; } } }), 'copied');
    assert.equal(copied, data.url);
  }
});
test('missing or refused clipboard returns a manual fallback, never a false success', async () => {
  for (const clipboard of [undefined, { async writeText() { throw new DOMException('denied', 'NotAllowedError'); } }]) {
    assert.equal(await shareSiteLink(data, { clipboard }), 'manual');
    assert.equal(await copySiteLink(data.url, { clipboard }), 'manual');
  }
});
test('copy only never opens the native sheet', async () => {
  assert.equal(await copySiteLink(data.url, {
    async share() { assert.fail('copy must not open native share'); },
    clipboard: { async writeText(value) { assert.equal(value, data.url); } },
  }), 'copied');
});
