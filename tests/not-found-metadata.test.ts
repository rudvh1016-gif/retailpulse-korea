import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {notFoundMetadataForPath, rewriteNotFoundMetadata} from '../worker/not-found-metadata';

test('only complete supported first path segments select a translation', () => {
  assert.match(notFoundMetadataForPath('/en/missing').title, /^Page not found/);
  assert.match(notFoundMetadataForPath('/zh/missing').title, /^找不到/);
  assert.match(notFoundMetadataForPath('/ja/missing').title, /^ページ/);
  for (const path of ['/missing', '/english/missing', '/en-US/missing', '/EN/missing', '/ko/missing']) {
    assert.match(notFoundMetadataForPath(path).title, /^페이지/);
  }
});

test('normal pages, redirects, API responses, RSC and non-HTML bypass rewriting', async () => {
  const cases: Array<{status?: number; type?: string; path?: string; headers?: HeadersInit; method?: string; empty?: boolean}> = [
    {status: 200}, {status: 301}, {status: 500}, {type: 'application/json'},
    {type: 'text/x-component'}, {path: '/api/missing'}, {path: '/api'},
    {headers: {rsc: '1'}}, {headers: {accept: 'text/x-component'}},
    {method: 'POST'}, {method: 'HEAD'}, {empty: true},
  ];
  for (const c of cases) {
    const request = new Request(`https://koretaildata.com${c.path ?? '/en/missing'}`, {method: c.method ?? 'GET', headers: c.headers});
    const response = new Response(c.empty ? null : '<html></html>', {status: c.status ?? 404, headers: {'content-type': c.type ?? 'text/html'}});
    assert.equal(await rewriteNotFoundMetadata(request, response), response);
    assert.equal(response.bodyUsed, false);
  }
});

test('narrow selectors preserve noindex, security headers and 404 status', async () => {
  type Handler = {element(element: {getAttribute(name: string): string | null; setAttribute(name: string, value: string): unknown; append(value: string): unknown; remove(): unknown}): void};
  const handlers = new Map<string, Handler>();
  class RewriterStub {
    on(selector: string, handler: Handler) { handlers.set(selector, handler); return this; }
    transform(response: Response) { return response; }
  }
  const runtime = globalThis as typeof globalThis & {HTMLRewriter?: unknown};
  const previous = runtime.HTMLRewriter;
  runtime.HTMLRewriter = RewriterStub;
  try {
    const response = new Response('<html></html>', {status: 404, statusText: 'Not Found', headers: {
      'content-type': 'text/html; charset=utf-8', 'content-length': '13', etag: 'old',
      'content-security-policy': "default-src 'self'", 'x-robots-tag': 'noindex', 'cache-control': 'no-store',
    }});
    const rewritten = await rewriteNotFoundMetadata(new Request('https://koretaildata.com/en/missing'), response);
    assert.equal(rewritten.status, 404);
    assert.equal(rewritten.statusText, 'Not Found');
    assert.equal(rewritten.headers.get('content-length'), null);
    assert.equal(rewritten.headers.get('etag'), null);
    assert.equal(rewritten.headers.get('content-security-policy'), "default-src 'self'");
    assert.equal(rewritten.headers.get('x-robots-tag'), 'noindex');
    assert.equal(rewritten.headers.get('cache-control'), 'no-store');
    assert.equal(await rewritten.text(), '<html></html>');
    function element(attributes: Record<string, string>) {
      const state = {removed: false, appended: '', attributes};
      return {state, getAttribute: (name: string) => state.attributes[name] ?? null,
        setAttribute(name: string, value: string) {state.attributes[name] = value; return this;},
        append(value: string) {state.appended += value; return this;},
        remove() {state.removed = true; return this;}};
    }
    const head = element({}); handlers.get('head')!.element(head);
    assert.match(head.state.appended, /<title>Page not found \| KORETAIL<\/title>/);
    const robots = element({name: 'robots', content: 'noindex'}); handlers.get('head meta')!.element(robots);
    assert.equal(robots.state.removed, false); assert.equal(robots.state.attributes.content, 'noindex');
    for (const attrs of [{rel: 'canonical'}, {rel: 'alternate', hreflang: 'en'}] as Record<string, string>[]) {
      const link = element(attrs); handlers.get('head link')!.element(link); assert.equal(link.state.removed, true);
    }
    for (const attrs of [{rel: 'stylesheet'}, {rel: 'alternate', type: 'application/rss+xml'}] as Record<string, string>[]) {
      const link = element(attrs); handlers.get('head link')!.element(link); assert.equal(link.state.removed, false);
    }
  } finally {
    if (previous === undefined) delete runtime.HTMLRewriter; else runtime.HTMLRewriter = previous;
  }
});

test('gateway applies correction only to the general response, never the summary cache', () => {
  const source = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.equal(source.match(/rewriteNotFoundMetadata\(request, await handler\.fetch\(request, env, ctx\)\)/g)?.length, 1);
  assert.match(source.slice(source.indexOf('export const SummaryCache')), /return handler\.fetch\(request, env, ctx\)/);
});

test('bounded probe returns the original response on source errors or oversize', async () => {
  const request = new Request('https://koretaildata.com/en/missing');
  const headers = {'content-type': 'text/html', 'x-robots-tag': 'noindex'};
  for (const delay of [0, 10]) {
    const response = new Response(new ReadableStream<Uint8Array>({start(controller) {
      if (delay) {controller.enqueue(new TextEncoder().encode('<html>')); setTimeout(() => controller.error(new Error('source failed')), delay);}
      else controller.error(new Error('source failed'));
    }}), {status: 404, headers});
    const result = await rewriteNotFoundMetadata(request, response);
    assert.equal(result, response); assert.equal(result.status, 404);
    await assert.rejects(() => result.text(), /source failed/);
  }
  for (const length of [undefined, '1']) {
    const text = 'x'.repeat(150_000);
    const response = new Response(text, {status: 404, headers: {...headers, ...(length ? {'content-length': length} : {})}});
    assert.equal(await rewriteNotFoundMetadata(request, response), response);
    assert.equal(await response.text(), text);
  }
});

test('timeout cancels only the probe branch while original bytes and cancellation remain usable', async () => {
  let canceled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {controller.enqueue(new TextEncoder().encode('<html>'));},
    cancel() {canceled = true;},
  }), {status: 404, headers: {'content-type': 'text/html'}});
  const before = Date.now();
  const result = await rewriteNotFoundMetadata(new Request('https://koretaildata.com/en/missing'), response);
  assert.equal(result, response); assert.ok(Date.now() - before < 2500);
  const reader = result.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), '<html>');
  await reader.cancel(); assert.equal(canceled, true);
});

test('declared oversize and encoded HTML bypass without consuming their original body', async () => {
  for (const extra of [{'content-length': '150000'}, {'content-encoding': 'gzip'}] as Record<string, string>[]) {
    const response = new Response('untouched', {status: 404, headers: {'content-type': 'text/html', ...extra}});
    const result = await rewriteNotFoundMetadata(new Request('https://koretaildata.com/en/missing'), response);
    assert.equal(result, response); assert.equal(result.bodyUsed, false); assert.equal(await result.text(), 'untouched');
  }
});

test('clone and synchronous rewriter failures fall back to the exact original response', async () => {
  const request = new Request('https://koretaildata.com/en/missing');
  const headers = {'content-type': 'text/html'};
  const uncloneable = new Response('<html></html>', {status: 404, headers});
  uncloneable.clone = () => {throw new Error('clone failed');};
  assert.equal(await rewriteNotFoundMetadata(request, uncloneable), uncloneable);
  assert.equal(await uncloneable.text(), '<html></html>');
  const runtime = globalThis as typeof globalThis & {HTMLRewriter?: unknown};
  const previous = runtime.HTMLRewriter;
  try {
    for (const where of ['constructor', 'transform']) {
      runtime.HTMLRewriter = class {
        constructor() {if (where === 'constructor') throw new Error('constructor failed');}
        on() {return this;}
        transform() {throw new Error('transform failed');}
      };
      const response = new Response('<html></html>', {status: 404, headers});
      assert.equal(await rewriteNotFoundMetadata(request, response), response);
      assert.equal(await response.text(), '<html></html>');
    }
  } finally {
    if (previous === undefined) delete runtime.HTMLRewriter; else runtime.HTMLRewriter = previous;
  }
});

test('a failed or never-ending transformed body cannot replace the original response', async () => {
  const runtime = globalThis as typeof globalThis & {HTMLRewriter?: unknown};
  const previous = runtime.HTMLRewriter;
  try {
    for (const mode of ['error', 'never']) {
      runtime.HTMLRewriter = class {
        on() {return this;}
        transform() {return new Response(new ReadableStream<Uint8Array>({start(controller) {
          if (mode === 'error') controller.error(new Error('transform stream failed'));
        }}), {status: 404, headers: {'content-type': 'text/html'}});}
      };
      const response = new Response('<html>original</html>', {status: 404, headers: {'content-type': 'text/html'}});
      const result = await rewriteNotFoundMetadata(new Request('https://koretaildata.com/en/missing'), response);
      assert.equal(result, response); assert.equal(await result.text(), '<html>original</html>');
    }
  } finally {
    if (previous === undefined) delete runtime.HTMLRewriter; else runtime.HTMLRewriter = previous;
  }
});


test('garbage collection cannot cancel the original probe stream, including reader-only ownership', () => {
  const result = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', fileURLToPath(new URL('./fixtures/not-found-probe-gc.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
