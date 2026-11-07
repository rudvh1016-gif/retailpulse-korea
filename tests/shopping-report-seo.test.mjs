import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

process.env.RPK_DEPLOYMENT_STAGE = 'production';
process.env.NEXT_PUBLIC_SITE_ORIGIN ??= 'https://koretaildata.com';
const { default: sitemap } = await import('../app/sitemap.ts');
const { siteOrigin } = await import('../app/seo-config.ts');
const html = readFileSync('public/shopping-report/index.html', 'utf8');
const head = html.split('</head>')[0];
const canonical = 'https://koretaildata.com/shopping-report/';
const meta = (name) => [...head.matchAll(/<meta\s+[^>]*>/g)]
  .filter(([tag]) => new RegExp(`(?:name|property)="${name}"`).test(tag))
  .map(([tag]) => tag.match(/content="([^"]*)"/)?.[1]);

test('shopping report HTML identifies one canonical public document', () => {
  const links = [...head.matchAll(/<link\s+[^>]*rel="canonical"[^>]*>/g)];
  assert.equal(links.length, 1);
  assert.equal(links[0][0].match(/href="([^"]*)"/)?.[1], canonical);
  assert.deepEqual(meta('og:url'), [canonical]);
  assert.doesNotMatch(head, /hreflang=/, 'the report has no translated versions');
});

test('shopping report share previews describe its own content using an existing image', () => {
  const title = head.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = meta('description')[0];
  assert.ok(title && description);
  for (const name of ['og:title', 'twitter:title']) assert.deepEqual(meta(name), [title]);
  for (const name of ['og:description', 'twitter:description']) assert.deepEqual(meta(name), [description]);
  assert.deepEqual(meta('og:locale'), ['ko_KR']);
  assert.deepEqual(meta('twitter:card'), ['summary_large_image']);
  const image = meta('og:image')[0];
  assert.ok(image?.startsWith('https://koretaildata.com/'));
  assert.ok(existsSync(`public${new URL(image).pathname}`));
  assert.deepEqual(meta('twitter:image'), [image]);
});

test('sitemap includes the shopping report once without fake translations or freshness', () => {
  const entries = sitemap().filter(entry => entry.url.includes('/shopping-report'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, `${siteOrigin}/shopping-report/`);
  assert.equal(entries[0].alternates, undefined);
  assert.equal(entries[0].lastModified, undefined);
});
