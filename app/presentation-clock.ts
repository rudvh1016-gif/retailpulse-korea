'use client';
import { useEffect, useState } from 'react';

/** A presentation clock only. It never triggers a fetch or changes source times.
 * Moved verbatim from ./area-demand-card, which re-exports it, so the airport
 * glance can use it without downloading that card and its charts. */
export function usePresentationClock(reference: string): number {
  const [time, setTime] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setTime(Date.now());
    const start = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60_000);
    return () => { window.clearTimeout(start); window.clearInterval(interval); };
  }, []);
  return time ?? Date.parse(reference);
}
