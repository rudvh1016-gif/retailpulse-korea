import type { Lang } from './retailpulse-data';
import type { DepartureMap } from '../lib/airport-departure-map';
import { mapCopy as copy, windowText } from '../lib/airport-departure-map-copy';
import './airport-models.css';
import { selectedZoneShares } from '../lib/airport-zone-shares';
import { zoneShareCopy } from '../lib/airport-zone-share-copy';
import { airportModelScope } from '../lib/airport-model-scope';
import { AirportSceneModel, airportSceneView, airportLightingBasis } from './airport-scene-model';
import { gateIntervals, registeredGateRegions, type RegisteredBuilding } from '../lib/airport-gate-regions';
import { AirportGateRegionRegister } from './airport-gate-region-register';



export function AirportConceptModel({ map, lang }: { map: DepartureMap; lang: Lang }) {
  const scope=map.buildingScope??map.terminal;
  const buildings: RegisteredBuilding[] = scope === 'all' ? ['T1','T2','CONCOURSE'] : [scope];
  const ranges = (side: 'WEST' | 'CENTER' | 'EAST') => buildings.map(building => {
    const gates = gateIntervals(registeredGateRegions(building).filter(gate => gate.side === side).map(gate => gate.gate));
    return gates ? (scope === 'all' ? copy.building[building][lang] + ' ' : '') + '(' + gates + ')' : '';
  }).filter(Boolean).join(' · ');
  const denominator = map.sides.total;
  const shares = selectedZoneShares(map.sides);
  const text = zoneShareCopy[lang];
  const unit = { ko: '편', en: ' flights', zh: '班', ja: '便' }[lang];
  const share = (side: 'EAST' | 'WEST' | 'CENTER' | 'UNVERIFIED') => shares[side] === null ? text.zero : `${shares[side].toFixed(1)}%`;
  return <figure className="airport-concept-model" data-testid="airport-concept-model" data-denominator={denominator}>
    <figcaption data-testid="airport-map-model-scope" data-terminal={scope}>{airportModelScope(scope,lang)} · {windowText(map.window, lang)}</figcaption>
    <AirportSceneModel scope={scope} lang={lang} className="airport-concept-picture" showBasis={false}>
      {scope!=='all'&&(['WEST', 'CENTER', 'EAST'] as const).map(side => {
        const view=airportSceneView(scope);const point=view.labels[side];
        return <div key={side} className="airport-concept-label" data-side={side} style={{left:`${point[0]/view.width*100}%`,top:`${point[1]/view.height*100}%`,right:'auto',transform:'translateX(-50%)'}}><strong>{copy.side[side][lang]}</strong>{map.sides[side]}{unit}{share(side) ? ` · ${share(side)}` : ''}</div>;
      })}
    </AirportSceneModel>
    <div className="airport-concept-counts">{(['WEST', 'CENTER', 'EAST'] as const).map(side => <div key={side} data-side={side}>{copy.side[side][lang]}<span className="airport-concept-gate-range" data-testid={`zone-range-${side}`}>{ranges(side)}</span><strong>{map.sides[side]}{unit}</strong><small>{share(side)}</small></div>)}</div>
    <p className="prep-note" data-testid="model-zone-note">{{ko:'동·서·중앙은 코리테일 분류 기준입니다.',en:'East, west and central zones use KORETAIL classification.',zh:'东、西、中央区域按KORETAIL标准划分。',ja:'東・西・中央はKORETAILの分類基準です。'}[lang]}</p>
    <AirportGateRegionRegister scope={scope} lang={lang}>
      <p className="prep-note" data-testid="model-share-basis">{text.concept} {text.basis} ({denominator}{unit}) {text.rounding}</p>
      {map.flights.some(f=>f.side==='UNVERIFIED'&&f.gate) && <p className="prep-note" data-testid="model-unverified-gate-numbers">{{ko:'선택한 시간의 위치 미확인 운항 게이트',en:'Unverified active gates in the selected window',zh:'所选时段位置未确认的运行登机口',ja:'選択時間の位置未確認運航搭乗口'}[lang]}: {[...new Set(map.flights.filter(f=>f.side==='UNVERIFIED'&&f.gate).map(f=>`${f.building} ${f.gate}`))].join(', ')}</p>}
      <p className="prep-note">{airportLightingBasis(lang)}</p>
    </AirportGateRegionRegister>
    <p className="prep-note" data-testid="model-unverified-share">{copy.side.UNVERIFIED[lang]} {map.sides.UNVERIFIED}{unit} · {share('UNVERIFIED')}{map.concourse !== null ? ` · ${copy.concourse[lang]} ${map.concourse}${unit}` : ''}</p>
  </figure>;
}
