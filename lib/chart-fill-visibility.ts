/** Existing chart marks replay once when first seen, not before the reader scrolls to them. */
export function observeChartFillVisibility() {
  if (typeof MutationObserver === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const horizontal = '.route-country-comparison > i, .route-country-comparison > b, .airport-country-bar-track > span, .cfp-track > i, .airport-month-compare-track > span, .history-bars li > i, .compare-bars div > i, .airport-gate-bar, .flight-side-distribution, .chart-fill-x-svg';
  const vertical = '.chart-fill-y-svg, .airport-month-chart svg > g';
  const selector = `${horizontal}, ${vertical}`;
  const media = window.matchMedia('(prefers-reduced-motion: no-preference)');
  const pending = new Map<Element, boolean>();
  const visible = new Set<Element>();
  const observed = new Set<Element>();
  const active = new Map<Element, Animation>();
  const anchors = new Map<Element, Set<Element>>();
  const visibleAnchors = new Set<Element>();
  const anchorFor = new WeakMap<Element, Element>();
  const allowed = () => document.visibilityState === 'visible' && media.matches && !document.querySelector('dialog[open][aria-modal="true"]');
  const stop = (target: Element) => { active.get(target)?.cancel(); active.delete(target); };
  const stopAll = () => { for (const target of active.keys()) stop(target); };
  const play = (target: Element, refresh = false) => {
    if (!target.isConnected || !allowed() || typeof target.animate !== 'function') return;
    const svg = target.namespaceURI === 'http://www.w3.org/2000/svg';
    if (svg && (typeof CSS === 'undefined' || !CSS.supports?.('transform-box', 'fill-box'))) return;
    // Above-the-fold marks may still be playing their original CSS reveal. Never double it.
    if (!refresh && target.getAnimations?.().some(animation => 'animationName' in animation && String(animation.animationName).startsWith('chart-fill-') && animation.playState === 'running')) return;
    stop(target);
    const scale = target.matches(vertical) ? 'scaleY(0)' : 'scaleX(0)';
    const animation = target.animate([{transform:scale},{transform:'none'}], {duration:450,easing:'ease-out'});
    active.set(target, animation);
    const finished = () => { if (active.get(target) === animation) active.delete(target); };
    animation.onfinish = finished;
    animation.oncancel = finished;
  };
  const reveal = () => {
    if (document.visibilityState !== 'visible' || document.querySelector('dialog[open][aria-modal="true"]')) {
      for (const target of pending.keys()) pending.set(target, true);
      return;
    }
    for (const [target, refresh] of pending) if (visible.has(target)) {
      pending.delete(target);
      play(target, refresh); // Reduced motion consumes the reveal without animating or hiding data.
    }
  };
  const viewport = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleAnchors.add(entry.target);
      else visibleAnchors.delete(entry.target);
      for (const mark of anchors.get(entry.target) ?? []) {
        if (entry.isIntersecting) visible.add(mark);
        else { visible.delete(mark); if (pending.has(mark)) pending.set(mark, true); stop(mark); }
      }
    }
    reveal();
  });
  const changes = new MutationObserver(records => {
    for (const record of records) {
      const node = record.target;
      if (!(node instanceof Element)) continue;
      if (record.attributeName === 'open') { if (!allowed()) stopAll(); reveal(); continue; }
      let target: Element | null = null;
      if (record.attributeName === 'style' && node.matches('.history-bars li > i, .compare-bars div > i, .airport-gate-bar')) target = node;
      if (record.attributeName === 'data-value' && node.matches('.airport-month-chart .airport-month-bar')) target = node.parentElement;
      if (!target) continue;
      if (viewport) { pending.set(target, true); reveal(); }
      else play(target, true); // Existing CSS remains the fallback without viewport observation.
    }
  });
  const discover = (element: Element) => {
    const marks = element.matches(selector) ? [element, ...element.querySelectorAll(selector)] : [...element.querySelectorAll(selector)];
    for (const mark of marks) if (!observed.has(mark)) {
      observed.add(mark);
      changes.observe(mark, {attributes:true,attributeFilter:['style','data-value']});
      // The monthly SVG value is on its rect while the transform belongs to its group.
      mark.querySelectorAll('.airport-month-bar').forEach(bar => changes.observe(bar, {attributes:true,attributeFilter:['data-value']}));
      if (viewport) {
        // Observe fixed tracks/plots, never a mark whose scale changes its own intersection.
        const anchor = mark.namespaceURI === 'http://www.w3.org/2000/svg' ? mark.closest('svg') ?? mark.parentElement ?? mark : mark.parentElement ?? mark;
        const group = anchors.get(anchor) ?? new Set<Element>();
        if (!anchors.has(anchor)) { anchors.set(anchor, group); viewport.observe(anchor); }
        group.add(mark); anchorFor.set(mark, anchor); pending.set(mark, false);
        if (visibleAnchors.has(anchor)) visible.add(mark);
      }
    }
    const dialogs = element.matches('dialog[aria-modal="true"]') ? [element] : [...element.querySelectorAll('dialog[aria-modal="true"]')];
    dialogs.forEach(dialog => changes.observe(dialog, {attributes:true,attributeFilter:['open']}));
    reveal();
  };
  discover(document.documentElement);
  const insertions = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) if (node instanceof Element) {
        for (const mark of observed) if (mark === node || node.contains(mark)) {
          const anchor = anchorFor.get(mark), group = anchor ? anchors.get(anchor) : undefined;
          group?.delete(mark);
          if (anchor && !group?.size) { viewport?.unobserve(anchor); anchors.delete(anchor); visibleAnchors.delete(anchor); }
          observed.delete(mark); pending.delete(mark); visible.delete(mark); stop(mark);
        }
      }
      for (const node of record.addedNodes) if (node instanceof Element) discover(node);
    }
  });
  insertions.observe(document.documentElement, {subtree:true,childList:true});
  const visibility = () => { if (!allowed()) stopAll(); reveal(); };
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('close', reveal, true);
  media.addEventListener('change', visibility);
  return () => {
    insertions.disconnect(); changes.disconnect(); viewport?.disconnect(); stopAll();
    pending.clear(); visible.clear(); observed.clear(); anchors.clear(); visibleAnchors.clear();
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('close', reveal, true);
    media.removeEventListener('change', visibility);
  };
}
