import { PAGEVIEWS_ORIGIN, pageviewPath, validPageviewsSnapshot, type PageviewsSnapshot } from './pageviews-contract';
import { PAGEVIEWS_DEPLOYMENT_ENABLED } from './pageviews-deployment';

let snapshot: PageviewsSnapshot | null = null;
const listeners = new Set<() => void>();
let lastPath: string | null = null;
let generation = 0;
const pending = new Set<AbortController>();
let consentEnabled = false;
let readAggregate = false;
let awaitingActivation = false;
export function getPageviewsSnapshot(): PageviewsSnapshot | null { return snapshot; }
export function subscribePageviews(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(value: PageviewsSnapshot | null) {
  snapshot = value;
  listeners.forEach(listener => listener());
}
function requestSnapshot(init: RequestInit) {
  const current = ++generation;
  const controller = new AbortController();
  pending.add(controller);
  const timer = setTimeout(() => controller.abort(), 4000);
  void fetch('/api/pageviews', { ...init, credentials: 'omit', signal: controller.signal }).then(async response => {
    const value: unknown = await response.json();
    if (current === generation) publish(validPageviewsSnapshot(value) ? value : { available: false, reason: 'unavailable' });
  }).catch(() => {
    if (current === generation) publish({ available: false, reason: 'unavailable' });
  }).finally(() => { clearTimeout(timer); pending.delete(controller); });
}
function publicAggregate() {
  readAggregate = true;
  // Public cached aggregate only: no event ID, body, cookies or receipt.
  requestSnapshot({ method: 'GET' });
}
/** One actual route render, not rerenders, prefetches, hashes or query changes.
 * Module state survives StrictMode remounts; document reload creates a new ID.
 */
export function trackOwnPageview(pathname: string, enabled: boolean): void {
  if (typeof window === 'undefined' || !PAGEVIEWS_DEPLOYMENT_ENABLED) return;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (window.location.origin !== PAGEVIEWS_ORIGIN || nav.webdriver) return;
  const wasEnabled = consentEnabled;
  consentEnabled = enabled && nav.doNotTrack !== '1' && !nav.globalPrivacyControl;
  if ((document as Document & { prerendering?: boolean }).prerendering) {
    if (!awaitingActivation) {
      awaitingActivation = true;
      document.addEventListener('prerenderingchange', () => { awaitingActivation = false; trackOwnPageview(window.location.pathname, consentEnabled); }, { once: true });
    }
    return;
  }
  const path = pageviewPath(pathname);
  if (!path) { lastPath = null; return; }
  if (!consentEnabled) {
    if (wasEnabled || !readAggregate) {
      generation++;
      pending.forEach(controller => controller.abort()); pending.clear();
      publish(null);
      publicAggregate();
    }
    return;
  }
  if (lastPath === path) {
    // A preference toggle is not another pageview. Refresh the public numbers.
    if (!wasEnabled) publicAggregate();
    return;
  }
  lastPath = path;
  // No persistent ID, cookie, fingerprint, IP or complete URL.
  const id = `${Date.now()}.${crypto.randomUUID()}`;
  requestSnapshot({
    method: 'POST', headers: { 'content-type': 'application/json', 'x-koretail-pageview': '1' },
    cache: 'no-store', body: JSON.stringify({ id, path }),
  });
}
