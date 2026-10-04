"use client";

import {useEffect, useRef} from 'react';

// Mobile toolbar/keyboard changes can resize the visual viewport before the
// fixed-position layout viewport catches up. Anchor directly to the visible
// bottom instead of deriving an offset from a possibly stale innerHeight.
export function useBottomNavigationViewport() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current, viewport = window.visualViewport;
    if (!nav || !viewport) return;
    const mobile = window.matchMedia('(max-width: 820px)');
    let frame = 0;
    const reset = () => { nav.style.removeProperty('top'); nav.style.removeProperty('bottom'); };
    const update = () => {
      frame = 0;
      // Keep browser zoom behavior and the desktop CSS contract unchanged.
      if (!mobile.matches || Math.abs(viewport.scale - 1) > 0.01) { reset(); return; }
      const height = nav.offsetHeight;
      if (!height || !Number.isFinite(viewport.height) || viewport.height <= 0) { reset(); return; }
      const top = Math.max(0, viewport.offsetTop + viewport.height - height);
      const value = `${Math.round(top * 100) / 100}px`;
      if (nav.style.top !== value) nav.style.top = value;
      if (nav.style.bottom !== 'auto') nav.style.bottom = 'auto';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    mobile.addEventListener('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); reset();
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      mobile.removeEventListener('change', schedule);
    };
  }, []);
  return ref;
}
