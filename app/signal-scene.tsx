export type SignalSceneKind = 'crowd' | 'rain' | 'temperature' | 'holiday' | 'event';

/** A static object model; the adjacent HTML, never the picture, carries data. */
export function SignalScene({ kind }: { kind: SignalSceneKind }) {
  return <span className="signal-scene" aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/visuals/signals/v1/${kind}-320.webp`}
      srcSet={`/visuals/signals/v1/${kind}-320.webp 320w, /visuals/signals/v1/${kind}-640.webp 640w`}
      sizes="(max-width: 760px) 92px, 112px" width="640" height="480" alt="" loading="lazy" decoding="async"/>
  </span>;
}
