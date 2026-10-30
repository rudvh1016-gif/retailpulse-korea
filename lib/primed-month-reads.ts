import {readStoredJson} from './read-stored-json';

/** One-use, short-lived read-ahead. The JSON body is covered by the original
 * deadline; an unused or evicted read cannot keep a connection alive forever. */
export function createPrimedMonthReads(now = () => Date.now(), freshnessMs = 10_000, capacity = 8) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid primed read capacity');
  const entries = new Map<string, {at: number; controller: AbortController; value: Promise<unknown>}>();
  const discard = (url: string) => {
    const entry = entries.get(url);
    entries.delete(url);
    entry?.controller.abort();
  };
  return {
    prime(url: string) {
      const saved = entries.get(url);
      if (saved && now() - saved.at < freshnessMs) return;
      if (saved) discard(url);
      while (entries.size >= capacity) discard(entries.keys().next().value!);
      const controller = new AbortController();
      const value = readStoredJson<unknown>(url, {cache: 'no-store', signal: controller.signal});
      // A view may never consume a primed failure. Keep it handled either way.
      void value.catch(() => {});
      entries.set(url, {at: now(), controller, value});
    },
    take(url: string, signal: AbortSignal): Promise<unknown> | null {
      const entry = entries.get(url);
      if (!entry) return null;
      entries.delete(url);
      if (now() - entry.at >= freshnessMs) { entry.controller.abort(); return null; }
      const cancel = () => entry.controller.abort(signal.reason);
      if (signal.aborted) { cancel(); return Promise.reject(signal.reason); }
      else signal.addEventListener('abort', cancel, {once: true});
      return entry.value.finally(() => signal.removeEventListener('abort', cancel));
    },
    size: () => entries.size,
  };
}
