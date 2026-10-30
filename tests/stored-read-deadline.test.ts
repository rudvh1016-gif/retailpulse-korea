import assert from 'node:assert/strict';
import test from 'node:test';
import {readStoredJson} from '../lib/read-stored-json';
import {createPrimedMonthReads} from '../lib/primed-month-reads';

const pendingUntilAborted = (signal: AbortSignal) => new Promise<Response>((_resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), {once: true});
});

test('a stored read preserves options and JSON and never retries an HTTP error', async t => {
  const calls: Array<{url: string; init: RequestInit}> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return calls.length === 1 ? Response.json({value: 0}) : new Response('', {status: 503});
  });
  assert.deepEqual(await readStoredJson('/api/stored', {cache: 'no-store', headers: {accept: 'application/json'}}), {value: 0});
  assert.equal(calls[0].init.cache, 'no-store');
  assert.deepEqual(calls[0].init.headers, {accept: 'application/json'});
  await assert.rejects(readStoredJson('/api/stored'), /STORED_READ_FAILED/);
  assert.equal(calls.length, 2);
});

test('a stalled header reaches the deadline without aborting the owning view', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const owner = new AbortController();
  t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => pendingUntilAborted(init.signal!));
  const read = readStoredJson('/api/stored', {signal: owner.signal});
  const rejected = assert.rejects(read, {name: 'TimeoutError'});
  t.mock.timers.tick(15_000);
  await rejected;
  assert.equal(owner.signal.aborted, false, 'the existing error/retry state must remain reachable');
});

test('the same deadline covers a stalled JSON body after successful headers', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let headersReceived = false;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = new ReadableStream({start(controller) {
      controller.enqueue(new TextEncoder().encode('{'));
      init.signal!.addEventListener('abort', () => controller.error(init.signal!.reason), {once: true});
    }});
    headersReceived = true;
    return new Response(body);
  });
  const read = readStoredJson('/api/stored');
  const rejected = assert.rejects(read, {name: 'TimeoutError'});
  await Promise.resolve();
  assert.equal(headersReceived, true);
  t.mock.timers.tick(15_000);
  await rejected;
});

test('changing selection cancels an in-flight body and an already cancelled view sends no request', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => {
    calls++;
    return pendingUntilAborted(init.signal!);
  });
  const owner = new AbortController();
  const read = readStoredJson('/api/stored', {signal: owner.signal});
  const rejected = assert.rejects(read, {name: 'AbortError'});
  owner.abort();
  await rejected;
  await assert.rejects(readStoredJson('/api/stored', {signal: owner.signal}), {name: 'AbortError'});
  assert.equal(calls, 1);
});

test('a successful read removes its deadline rather than later cancelling a completed request', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {signal = init.signal!; return Response.json({ok: true});});
  await readStoredJson('/api/stored');
  t.mock.timers.tick(30_000);
  assert.equal(signal!.aborted, false);
});

test('read-ahead is consumed once, coalesces a fresh URL, and preserves the parsed result', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {calls++; return Response.json({month: '2026-09'});});
  const cache = createPrimedMonthReads(() => 0);
  cache.prime('/api/month?month=2026-09');
  cache.prime('/api/month?month=2026-09');
  assert.equal(calls, 1);
  assert.deepEqual(await cache.take('/api/month?month=2026-09', new AbortController().signal), {month: '2026-09'});
  assert.equal(cache.take('/api/month?month=2026-09', new AbortController().signal), null);
  assert.equal(cache.size(), 0);
});

test('expired and excess read-ahead entries abort their actual network requests', async t => {
  let now = 0;
  const signals: AbortSignal[] = [];
  t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => {signals.push(init.signal!); return pendingUntilAborted(init.signal!);});
  const cache = createPrimedMonthReads(() => now, 10_000, 2);
  cache.prime('a'); cache.prime('b'); now = 1; cache.prime('c');
  assert.equal(cache.size(), 2);
  assert.equal(signals[0].aborted, true);
  now = 10_000;
  assert.equal(cache.take('b', new AbortController().signal), null);
  assert.equal(signals[1].aborted, true);
  const owner = new AbortController();
  const taken = cache.take('c', owner.signal)!;
  const rejected = assert.rejects(taken, {name: 'AbortError'});
  owner.abort();
  await rejected;
  assert.equal(signals[2].aborted, true);
});

test('unused read-ahead also ends after fifteen seconds and a later prime can recover', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let now = 0, calls = 0;
  const signals: AbortSignal[] = [];
  t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => {
    calls++; signals.push(init.signal!);
    return calls === 1 ? pendingUntilAborted(init.signal!) : Promise.resolve(Response.json({status: 'READY'}));
  });
  const cache = createPrimedMonthReads(() => now);
  cache.prime('a');
  t.mock.timers.tick(15_000); now = 15_000;
  await Promise.resolve();
  assert.equal(signals[0].aborted, true);
  cache.prime('a');
  assert.deepEqual(await cache.take('a', new AbortController().signal), {status: 'READY'});
  assert.equal(calls, 2);
});
