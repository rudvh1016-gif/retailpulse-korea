import type { Lang } from './retailpulse-data';
import type { DepartureMap } from '../lib/airport-departure-map';
import { mapCopy as copy, windowText } from '../lib/airport-departure-map-copy';
import './airport-models.css';
import { airportModelScope } from '../lib/airport-model-scope';
import { AirportSceneModel, airportSceneView, airportLightingBasis } from './airport-scene-model';
import { AirportGateRegionRegister } from './airport-gate-region-register';

const note = {
  ko: '공항 개념 모형입니다. 색은 구역을 설명하며 공식 건물 경계나 실제 게이트 위치가 아닙니다. 동서 비율은 동+서 편수, 목적지 비율은 선택 범위 전체 편수가 분모입니다.',
  en: 'Concept airport model. Colours describe zones, not official building boundaries or gate positions. East/west shares use east + west flights; destination shares use all flights in the selected window.',
  zh: '机场概念模型。颜色表示区域，并非官方建筑边界或实际登机口位置。东西占比以东侧+西侧航班为分母，目的地占比以所选时段全部航班为分母。',
  ja: '空港の概念模型です。色は区域を示し、公式の建物境界や実際のゲート位置ではありません。東西比率の分母は東+西の便数、目的地比率は選択範囲の全便数です。',
};

export function AirportConceptModel({ map, lang }: { map: DepartureMap; lang: Lang }) {
  const scope=map.buildingScope??map.terminal;
  const denominator = map.sides.EAST + map.sides.WEST;
  const unit = { ko: '편', en: ' flights', zh: '班', ja: '便' }[lang];
  const share = (side: 'EAST' | 'WEST' | 'CENTER') => side === 'CENTER' || denominator === 0 ? '' : `${(map.sides[side] / denominator * 100).toFixed(1)}%`;
  return <figure className="airport-concept-model" data-testid="airport-concept-model">
    <figcaption data-testid="airport-map-model-scope" data-terminal={scope}>{airportModelScope(scope,lang)} · {windowText(map.window, lang)}</figcaption>
    <AirportSceneModel scope={scope} lang={lang} className="airport-concept-picture" showBasis={false}>
      {scope!=='all'&&(['WEST', 'CENTER', 'EAST'] as const).map(side => {
        const view=airportSceneView(scope);const point=view.labels[side];
        return <div key={side} className="airport-concept-label" data-side={side} style={{left:`${point[0]/view.width*100}%`,top:`${point[1]/view.height*100}%`,right:'auto',transform:'translateX(-50%)'}}><strong>{copy.side[side][lang]}</strong>{map.sides[side]}{unit}{share(side) ? ` · ${share(side)}` : ''}</div>;
      })}
    </AirportSceneModel>
    <div className="airport-concept-counts">{(['WEST', 'CENTER', 'EAST'] as const).map(side => <div key={side}>{copy.side[side][lang]}<strong>{map.sides[side]}{unit}</strong><small>{share(side) || '—'}</small></div>)}</div>
    <AirportGateRegionRegister scope={scope} lang={lang}/>
    {map.flights.some(f=>f.side==='UNVERIFIED'&&f.gate) && <p className="prep-note" data-testid="model-unverified-gate-numbers">{{ko:'선택한 시간의 위치 미확인 운항 게이트',en:'Unverified active gates in the selected window',zh:'所选时段位置未确认的运行登机口',ja:'選択時間の位置未確認運航搭乗口'}[lang]}: {[...new Set(map.flights.filter(f=>f.side==='UNVERIFIED'&&f.gate).map(f=>`${f.building} ${f.gate}`))].join(', ')}</p>}
    <details className="prep-evidence"><summary>{{ko:'모형·집계 기준',en:'Model and counting basis',zh:'模型与统计基准',ja:'模型・集計基準'}[lang]}</summary><p className="prep-note">{note[lang]} {airportLightingBasis(lang)}</p></details>
    <p className="prep-note">{copy.side.UNVERIFIED[lang]} {map.sides.UNVERIFIED}{unit}{map.concourse !== null ? ` · ${copy.concourse[lang]} ${map.concourse}${unit}` : ''}</p>
  </figure>;
}
