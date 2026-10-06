export type WeatherMetricKind = 'temperature' | 'rain' | 'wind' | 'humidity' | 'air' | 'sun' | 'cloud' | 'snow';

/** Topic icons except sun/cloud/snow, which are selected from an explicit published condition. */
export function WeatherMetricScene({ kind }: { kind: WeatherMetricKind }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="weather-metric-scene" src={`/visuals/weather/v2/${kind}-320.webp`}
    srcSet={`/visuals/weather/v2/${kind}-320.webp 320w, /visuals/weather/v2/${kind}-640.webp 640w`}
    sizes="56px" width="640" height="480" alt="" aria-hidden="true" loading="lazy" decoding="async"/>;
}
