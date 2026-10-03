import type { Lang } from './retailpulse-data';
import type { DepartureMap } from '../lib/airport-departure-map';
import { mapCopy as copy, windowText } from '../lib/airport-departure-map-copy';
import './airport-models.css';

const note = {
  ko: '공항 개념 모형입니다. 색은 구역을 설명하며 공식 건물 경계나 실제 게이트 위치가 아닙니다. 동서 비율은 동+서 편수, 목적지 비율은 선택 범위 전체 편수가 분모입니다.',
  en: 'Concept airport model. Colours describe zones, not official building boundaries or gate positions. East/west shares use east + west flights; destination shares use all flights in the selected window.',
  zh: '机场概念模型。颜色表示区域，并非官方建筑边界或实际登机口位置。东西占比以东侧+西侧航班为分母，目的地占比以所选时段全部航班为分母。',
  ja: '空港の概念模型です。色は区域を示し、公式の建物境界や実際のゲート位置ではありません。東西比率の分母は東+西の便数、目的地比率は選択範囲の全便数です。',
};

export function AirportConceptModel({ map, lang }: { map: DepartureMap; lang: Lang }) {
  const denominator = map.sides.EAST + map.sides.WEST;
  const unit = { ko: '편', en: ' flights', zh: '班', ja: '便' }[lang];
  const share = (side: 'EAST' | 'WEST' | 'CENTER') => side === 'CENTER' || denominator === 0 ? '' : `${(map.sides[side] / denominator * 100).toFixed(1)}%`;
  return <figure className="airport-concept-model" data-testid="airport-concept-model">
    <figcaption>{copy.building[map.terminal][lang]} · {windowText(map.window, lang)}</figcaption>
    <div className="airport-concept-picture">
      {/* The owner-approved D render is data-free. Labels always come from the current window calculation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/airport-models/approved-D-900.webp" srcSet="/airport-models/approved-D-480.webp 480w, /airport-models/approved-D-900.webp 900w, /airport-models/approved-D-1800.webp 1800w" sizes="(max-width: 820px) calc(100vw - 36px), 700px" width="1800" height="1000" alt="" loading="lazy" decoding="async"/>
      {(['WEST', 'CENTER', 'EAST'] as const).map(side => <div key={side} className="airport-concept-label" data-side={side}><strong>{copy.side[side][lang]}</strong>{map.sides[side]}{unit}{share(side) ? ` · ${share(side)}` : ''}</div>)}
    </div>
    <div className="airport-concept-counts">{(['WEST', 'CENTER', 'EAST'] as const).map(side => <div key={side}>{copy.side[side][lang]}<strong>{map.sides[side]}{unit}</strong><small>{share(side) || '—'}</small></div>)}</div>
    <details className="prep-evidence"><summary>{{ko:'모형·집계 기준',en:'Model and counting basis',zh:'模型与统计基准',ja:'模型・集計基準'}[lang]}</summary><p className="prep-note">{note[lang]}</p></details>
    <p className="prep-note">{copy.side.UNVERIFIED[lang]} {map.sides.UNVERIFIED}{unit}{map.concourse !== null ? ` · ${copy.concourse[lang]} ${map.concourse}${unit}` : ''}</p>
  </figure>;
}
