"use client";
import { useEffect, useRef, useState } from "react";
import { REVEAL_MS, countUp } from "../lib/motion";

/**
 * A number that counts up to its value when it first arrives, and rolls from
 * the old value to the new one when the scope changes (전체 → T1). The text
 * content is always the formatted value once the reveal has finished, so
 * nothing that reads the page sees a different number than the data holds.
 * With `animate` off (the personal home's plain figure) it is just the number.
 */
export function CountUpNumber({ value, locale, animate = true }: { value: number; locale: string; animate?: boolean }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  const mounted = useRef(false);
  useEffect(() => {
    const from = mounted.current ? current.current : 0;
    mounted.current = true;
    if (!animate || from === value) { current.current = value; setShown(value); return; }
    const stop = countUp(value, (step) => { current.current = step; setShown(step); }, REVEAL_MS, from);
    return () => { stop(); current.current = value; setShown(value); };
  }, [value, animate]);
  return <>{Math.round(shown).toLocaleString(locale)}</>;
}
