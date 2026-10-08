import type { Lang } from './retailpulse-data';
import type { DepartureMap } from '../lib/airport-departure-map';
import { mapCopy as copy, windowText } from '../lib/airport-departure-map-copy';
import './airport-models.css';
import { buildingZoneCounts, selectedZoneShares } from '../lib/airport-zone-shares';
import { zoneShareCopy } from '../lib/airport-zone-share-copy';
import { airportModelScope } from '../lib/airport-model-scope';
import { AirportSceneModel, airportLightingBasis } from './airport-scene-model';
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
  const perBuilding = scope === 'all' ? buildingZoneCounts(map) : null;
  const text = zoneShareCopy[lang];
  const unit = { ko: '편', en: ' flights', zh: '班', ja: '便' }[lang];
  const share = (side: 'EAST' | 'WEST' | 'CENTER' | 'UNVERIFIED') => shares[side] === null ? text.zero : `${shares[side].toFixed(1)}%`;
  return <figure className="airport-concept-model" data-testid="airport-concept-model" data-denominator={denominator}>
    <figcaption data-testid="airport-map-model-scope" data-terminal={scope}>{airportModelScope(scope,lang)} · {windowText(map.window, lang)}</figcaption>
    <AirportSceneModel scope={scope} lang={lang} className="airport-concept-picture" showBasis={false}>
    {buildings.map(building => {
      const counts = perBuilding ? perBuilding[building] : map.sides;
      const buildingShares = selectedZoneShares(counts);
      const gatesPending = counts.total > 0 && counts.WEST + counts.CENTER + counts.EAST === 0;
      return <div key={building} className={`airport-concept-counts${perBuilding ? ' airport-concept-building-counts' : ''}`} data-building={building} data-denominator={counts.total} role="group" aria-label={`${copy.building[building][lang]} · ${gatesPending ? text.gatesPending : text.basis}`}>
        {gatesPending ? <div data-testid="model-gates-pending" style={{gridColumn:'1 / -1'}}><span className="airport-concept-zone-name">{{ko:'전체 출발편',en:'Total departure flights',zh:'全部出发航班',ja:'全出発便'}[lang]}</span><span className="airport-concept-zone-values"><strong>{counts.total.toLocaleString(lang==='zh'?'zh-CN':lang)}{unit}</strong><small>{text.gatesPending}</small></span></div> : (['WEST', 'CENTER', 'EAST'] as const).map(side => <div key={side} data-side={side}>
          <span className="airport-concept-zone-name">{copy.side[side][lang]}</span>
          <span className="airport-concept-zone-values"><strong>{counts[side]}{unit}</strong><small>{buildingShares[side] === null ? text.zero : `${buildingShares[side].toFixed(1)}%`}</small></span>
        </div>)}
      </div>;
    })}
    </AirportSceneModel>
    <div className="airport-concept-ranges">{(['WEST', 'CENTER', 'EAST'] as const).map(side => <div key={side} data-side={side}>{copy.side[side][lang]}<span className="airport-concept-gate-range" data-testid={`zone-range-${side}`}>{ranges(side)}</span></div>)}</div>
    <p className="prep-note" data-testid="model-zone-note">{{ko:'동·서·중앙은 코리테일 분류 기준입니다.',en:'East, west and central zones use KORETAIL classification.',zh:'东、西、中央区域按KORETAIL标准划分。',ja:'東・西・中央はKORETAILの分類基準です。'}[lang]}</p>
    <AirportGateRegionRegister scope={scope} lang={lang}>
      <p className="prep-note" data-testid="model-share-basis">{text.concept} {text.basis} ({denominator}{unit}) {text.rounding}</p>
      {perBuilding && <p className="prep-note" data-testid="model-building-share-basis">{{ko:'각 그림의 비율은 해당 건물의 전체 출발편 기준이며 위치 미확인 편을 포함합니다. 건물 미정은 어느 그림에도 배정하지 않습니다.',en:'Each picture uses its own building’s total departures, including unverified zones. Unknown buildings are not assigned to a picture.',zh:'每幅图的比例以该建筑的全部出发航班为分母，包含位置未确认航班。建筑未定航班不分配到任何图中。',ja:'各図の割合はその建物の全出発便が分母で、位置未確認便も含みます。建物未定の便は各図に割り当てません。'}[lang]} {buildings.map(building => `${copy.building[building][lang]} ${perBuilding[building].total}${unit}`).join(' · ')}</p>}
      {map.flights.some(f=>f.side==='UNVERIFIED'&&f.gate) && <p className="prep-note" data-testid="model-unverified-gate-numbers">{{ko:'선택한 시간의 위치 미확인 운항 게이트',en:'Unverified active gates in the selected window',zh:'所选时段位置未确认的运行登机口',ja:'選択時間の位置未確認運航搭乗口'}[lang]}: {[...new Set(map.flights.filter(f=>f.side==='UNVERIFIED'&&f.gate).map(f=>`${f.building} ${f.gate}`))].join(', ')}</p>}
      <p className="prep-note">{airportLightingBasis(lang)}</p>
    </AirportGateRegionRegister>
    <p className="prep-note" data-testid="model-unverified-share">{copy.side.UNVERIFIED[lang]} {map.sides.UNVERIFIED}{unit} · {share('UNVERIFIED')}{map.concourse !== null ? ` · ${copy.concourse[lang]} ${map.concourse}${unit}` : ''}</p>
  </figure>;
}
