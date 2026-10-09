"use client";

import {useEffect, useRef} from 'react';
import {queueHeat, queueHeatLabel, type QueueHeatReading} from '../lib/airport-queue-heat';

export function AirportQueueScene({reading, now, lang}: {reading: QueueHeatReading; now: number; lang: string}) {
  const scene = useRef<HTMLSpanElement>(null);
  const heat = queueHeat(reading, now);
  const animated = heat.level === 'busy' || heat.level === 'very-busy';

  useEffect(() => {
    const element = scene.current;
    if (!element || !animated || !window.IntersectionObserver) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let played = false;
    const update = () => {
      if (!visible || document.hidden || preference.matches) {
        element.dataset.motion = 'off';
      } else if (!played) {
        played = true;
        element.dataset.motion = 'running';
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      update();
    }, {threshold: [0, 0.5]});
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    preference.addEventListener('change', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      preference.removeEventListener('change', update);
      delete element.dataset.motion;
    };
  }, [animated, heat.level, reading.observedAt]);

  return <span ref={scene} className="airport-queue-scene" data-heat={heat.level} data-state={heat.state} data-basis={heat.basis}>
    <span className="airport-queue-scene-visual" aria-hidden="true">
      {/* Fixed illustrative people/equipment: the backdrop uses T2 categories or explicitly labelled T1 minute criteria. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- small local responsive Blender export */}
      <img className="airport-queue-model" src="/visuals/airport-queue/queue-checkpoint-192.webp" srcSet="/visuals/airport-queue/queue-checkpoint-192.webp 192w, /visuals/airport-queue/queue-checkpoint-384.webp 384w" sizes="(min-width: 821px) 128px, 96px" width="192" height="144" alt="" loading="lazy" decoding="async" />
      {animated && <span className="airport-queue-heat"><span/><span/><span/></span>}
    </span>
    <small className="airport-queue-state">{queueHeatLabel(heat, lang)}</small>
  </span>;
}
