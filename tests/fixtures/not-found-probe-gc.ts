import assert from 'node:assert/strict';
import {rewriteNotFoundMetadata} from '../../worker/not-found-metadata';

// Run in a child started with --expose-gc. Older Node/Undici can finalize a
// temporary Response clone while its reader is still active and cancel the
// ORIGINAL tee branch. Exercise the real runtime rather than mocking GC away.
const gc = (globalThis as typeof globalThis & {gc?: () => void}).gc;
assert.equal(typeof gc, 'function');
let canceled = false;
async function originalReaderOnly() {
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {controller.enqueue(new TextEncoder().encode('<html>'));},
    cancel() {canceled = true;},
  }), {status: 404, headers: {'content-type': 'text/html'}});
  const result = await rewriteNotFoundMetadata(new Request('https://koretaildata.com/en/missing'), response);
  assert.equal(result, response);
  assert.equal(result.status, 404);
  return result.body!.getReader();
}

const collection = setInterval(() => gc!(), 10);
try {
  const reader = await originalReaderOnly();
  // No Response wrapper is retained here, only its body reader.
  await new Promise(resolve => setTimeout(resolve, 100));
  const chunk = await reader.read();
  assert.equal(chunk.done, false);
  assert.equal(new TextDecoder().decode(chunk.value), '<html>');
  await reader.cancel();
  reader.releaseLock();
  assert.equal(canceled, true);
} finally {
  clearInterval(collection);
}
