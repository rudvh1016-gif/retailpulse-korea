'use client';
import {useEffect} from 'react';

/** Replays chart marks when React updates existing nodes instead of remounting them. */
export function useChartFillRefresh() {
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof window.matchMedia !== 'function') return;
    const horizontal = '.history-bars li > i, .compare-bars div > i, .airport-gate-bar';
    const vertical = '.airport-month-chart .airport-month-bar';
    const selector = `${horizontal}, ${vertical}`;
    const active = new WeakMap<Element, Animation>();
    const changes = new MutationObserver(records => {
      if (document.visibilityState !== 'visible' || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
      const targets = new Map<Element, 'x' | 'y'>();
      for (const record of records) {
        const node = record.target;
        if (!(node instanceof Element) || typeof node.matches !== 'function') continue;
        if (record.attributeName === 'style' && node.matches(horizontal)) targets.set(node, 'x');
        if (record.attributeName === 'data-value' && node.matches(vertical)) {
          const group = node.parentElement;
          if (group && typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transform-box', 'fill-box')) targets.set(group, 'y');
        }
      }
      for (const [target, axis] of targets) {
        if (typeof target.animate !== 'function') continue;
        active.get(target)?.cancel();
        const scale = axis === 'x' ? 'scaleX(0)' : 'scaleY(0)';
        active.set(target, target.animate([{transform:scale},{transform:'none'}], {duration:450,easing:'ease-out'}));
      }
    });
    const watch = (element: Element) => changes.observe(element, {attributes:true,attributeFilter:['style','data-value']});
    const discover = (element: Element) => {
      if (typeof element.matches !== 'function') return;
      if (element.matches(selector)) watch(element);
      element.querySelectorAll(selector).forEach(watch);
    };
    discover(document.documentElement);
    const insertions = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) discover(node);
    });
    insertions.observe(document.documentElement, {subtree:true,childList:true});
    return () => { insertions.disconnect(); changes.disconnect(); };
  }, []);
}
