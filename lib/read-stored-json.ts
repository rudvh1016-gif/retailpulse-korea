/** Read an existing JSON endpoint with one deadline covering headers AND body.
 * Cancellation from an unmounted view remains separate from a timed-out read.
 * No retry, provider request or cache-policy change is introduced here. */
export async function readStoredJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener('abort', cancel, {once: true});
  const timer = setTimeout(() => controller.abort(new DOMException('Stored read timed out', 'TimeoutError')), timeoutMs);
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(url, {...init, signal: controller.signal});
    if (!response.ok) throw new Error('STORED_READ_FAILED');
    const value = await response.json() as T;
    controller.signal.throwIfAborted();
    return value;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
