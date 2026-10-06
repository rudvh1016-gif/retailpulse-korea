import type { Lang } from './retailpulse-data';

export type PrepSymbolKind = 'crowd' | 'rain' | 'temperature' | 'holiday' | 'event';

/** Fixed information-category icons. Real facts and all place names stay in HTML. */
export function PrepSymbolScene({ kind, lang }: { kind: PrepSymbolKind; lang: Lang }) {
  return <span className="prep-symbol" data-visual-kind={kind}>
    <span className="signal-scene" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/visuals/prep-symbols/v2/${kind}-320.webp`}
        srcSet={`/visuals/prep-symbols/v2/${kind}-320.webp 320w, /visuals/prep-symbols/v2/${kind}-640.webp 640w`}
        sizes="(max-width: 760px) 92px, 112px" width="640" height="480" alt="" loading="lazy" decoding="async"/>
    </span>
    <small className="prep-symbol-caption">{{ ko: '정보 종류 아이콘', en: 'Information icon', zh: '信息类别图标', ja: '情報の種類アイコン' }[lang]}</small>
  </span>;
}
