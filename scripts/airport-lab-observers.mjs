/**
 * Frontend lab attribution only, installed before navigation. Keep this function
 * self-contained: Playwright serializes it into the isolated browser context.
 * Never read input values, attributes, cookies or storage. Text is restricted
 * to the fixture-backed public briefing; other elements are identified by tag
 * and CSS classes only. No additional layout reads are made.
 */
export function installAirportLabObservers() {
  const limit = { lcp: 20, shifts: 40, sources: 5 };
  const path = (element) => {
    const parts = [];
    for (let node = element; node?.tagName && parts.length < 6; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      const classes = typeof node.className === 'string'
        ? node.className.split(/\s+/).filter(Boolean).slice(0, 3).map(name => name.slice(0, 48))
        : [];
      let index = 1, scanned = 0;
      for (let sibling = node.previousElementSibling; sibling && scanned < 100; sibling = sibling.previousElementSibling) {
        if (sibling.tagName === node.tagName) index++;
        scanned++;
      }
      parts.unshift(`${tag}${classes.length ? `.${classes.join('.')}` : ''}:nth-of-type(${index})`);
    }
    return parts.join(' > ').slice(-480);
  };
  const rect = (value) => value ? Object.fromEntries(
    ['x', 'y', 'width', 'height'].map(key => [key, Math.round(value[key] * 100) / 100]),
  ) : null;
  const state = window.__lab = {
    lcp: null, lcpElement: null, cls: 0, blockingMs: 0,
    lcpCandidates: [], layoutShifts: [],
    attributionDropped: { lcpCandidates: 0, layoutShifts: 0 },
  };
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const element = entry.element;
      state.lcp = entry.startTime;
      state.lcpElement = element?.tagName + (element?.className ? `.${String(element.className).replaceAll(' ', '.')}` : '');
      if (state.lcpCandidates.length >= limit.lcp) { state.attributionDropped.lcpCandidates++; continue; }
      // This fixed lab uses captured public API fixtures. Do not expand this
      // allowlist to arbitrary page text or collect form/contenteditable text.
      const safeText = element?.closest?.('.focus-report')
        && !element.closest('input,textarea,select,[contenteditable],form')
        && !element.querySelector?.('input,textarea,select,[contenteditable],form');
      state.lcpCandidates.push({
        startTime: entry.startTime, renderTime: entry.renderTime, loadTime: entry.loadTime,
        size: entry.size, element: state.lcpElement, path: path(element),
        text: safeText ? String(element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) : null,
      });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      // Preserve the existing budget's cumulative observation, not a new
      // session-window metric. Attribution does not change budget semantics.
      state.cls += entry.value;
      if (state.layoutShifts.length >= limit.shifts) { state.attributionDropped.layoutShifts++; continue; }
      state.layoutShifts.push({
        startTime: entry.startTime, value: entry.value,
        sources: Array.from(entry.sources ?? []).slice(0, limit.sources).map(source => ({
          path: path(source.node), previousRect: rect(source.previousRect), currentRect: rect(source.currentRect),
        })),
        sourcesDropped: Math.max(0, (entry.sources?.length ?? 0) - limit.sources),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) state.blockingMs += Math.max(0, entry.duration - 50);
  }).observe({ type: 'longtask', buffered: true });
}

/** Self-contained browser snapshot; URL queries, fragments and credentials
 * never enter the artifact. Keep the full existing byte accounting; only the
 * additional timing entries are capped. */
export function collectAirportLabMeasurement() {
  const url = (name) => {
    try {
      const parsed = new URL(name, location.href);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '[non-http resource]';
      return `${parsed.origin === location.origin ? '' : parsed.origin}${parsed.pathname}`.slice(0, 512);
    } catch { return '[invalid resource URL]'; }
  };
  const resources = performance.getEntriesByType('resource');
  const navigation = performance.getEntriesByType('navigation')[0];
  const timings = (entry) => Object.fromEntries(
    ['startTime', 'fetchStart', 'requestStart', 'responseStart', 'responseEnd', 'duration'].map(key => [key, entry[key]]),
  );
  return {
    ...window.__lab,
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    resources: resources.map(entry => ({
      url: url(entry.name), initiator: entry.initiatorType, bytes: entry.transferSize, encoded: entry.encodedBodySize,
    })),
    resourceTimings: resources.slice(0, 160).map(entry => ({
      url: url(entry.name), initiator: entry.initiatorType, ...timings(entry),
      renderBlockingStatus: entry.renderBlockingStatus ?? null,
    })),
    resourceTimingsDropped: Math.max(0, resources.length - 160),
    navigation: navigation?.transferSize ?? null,
    navigationTiming: navigation ? {
      ...timings(navigation), domContentLoaded: navigation.domContentLoadedEventEnd, load: navigation.loadEventEnd,
    } : null,
    overflow: document.documentElement.scrollWidth > innerWidth,
    hydrated: document.querySelector('.app')?.getAttribute('data-hydrated') === 'true',
    noticeOpen: Boolean(document.querySelector('dialog.update-notice[open]')),
  };
}
