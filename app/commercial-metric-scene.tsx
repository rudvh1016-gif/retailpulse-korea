export type CommercialMetricKind = 'amount' | 'count' | 'average';

/** Decorative category sculpture; published numeric values remain in the definition list. */
export function CommercialMetricScene({ kind }: { kind: CommercialMetricKind }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="commercial-metric-scene" src={`/visuals/commercial/v1/${kind}-320.webp`}
    srcSet={`/visuals/commercial/v1/${kind}-320.webp 320w, /visuals/commercial/v1/${kind}-640.webp 640w`}
    sizes="64px" width="640" height="480" alt="" aria-hidden="true" loading="lazy" decoding="async"/>;
}
