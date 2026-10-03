import type {Lang} from './retailpulse-data';
import type {DepartureMap} from '../lib/airport-departure-map';
import {zoneCountries,type ZoneCountry} from '../lib/airport-zone-countries';
import {mapCopy} from '../lib/airport-departure-map-copy';
const locale={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
export function AirportZoneCountries({map,lang,basis}:{map:DepartureMap;lang:Lang;basis?:string}) {
 const flights=map.buildingScope?map.flights:map.flights.filter(f=>f.building===map.terminal);
 const zones=zoneCountries(flights);const max=Math.max(1,...zones.flatMap(z=>z.countries.map(c=>c.flights)));
 const names=new Intl.DisplayNames([locale[lang]],{type:'region'});
 const unknown={ko:'목적지 국가 미정',en:'Destination country unknown',zh:'目的地国家未定',ja:'目的地国未定'}[lang];
 const unit={ko:'편',en:' flights',zh:'班',ja:'便'}[lang];
 const row=(item:ZoneCountry)=><li key={item.country??'unknown'} data-country={item.country??'UNKNOWN'} data-value={item.flights}>
  <span>{item.country?names.of(item.country):unknown}</span><strong>{item.flights}{unit}</strong>
  <svg className="airport-country-prism" viewBox="0 0 240 20" role="img" aria-label={`${item.country?names.of(item.country):unknown} ${item.flights}${unit}`} data-domain-max={max}>
   {item.flights>0&&<><rect x="0" y="4" width={item.flights/max*240} height="12" rx="5" fill="#B5D6E6"/><rect x="0" y="4" width={item.flights/max*240} height="8" rx="5" fill="#EDF4F8"/><path d={`M0 16H${item.flights/max*240}`} stroke="#90B6CD"/></>}
  </svg>
 </li>;
 return <section className="airport-zone-countries" data-testid="map-zone-countries">
  <h4>{{ko:'구역별 목적지 국가',en:'Destination countries by zone',zh:'分区目的地国家',ja:'エリア別目的地国'}[lang]}</h4>
  <p className="prep-note">{{ko:'항공편 수 기준 · 승객 국적 아님',en:'Flight counts · not passenger nationality',zh:'航班数量 · 非旅客国籍',ja:'便数基準 · 旅客国籍ではありません'}[lang]}</p>
  <details className="prep-evidence"><summary>{{ko:'집계 기준',en:'Counting basis',zh:'统计口径',ja:'集計基準'}[lang]}</summary><p className="prep-note">{{ko:'선택 날짜·시간의 물리적 출발편 기준. 각 구역 비중은 선택 전체 편수 분모, 모든 막대는 같은 최대값 축입니다. 항공사 등록국가·승객 국적·사람 수가 아닙니다. 상위 3위와 동률 전원을 표시합니다.',en:'Physical departures for the selected date and time. Zone shares use all selected flights; bars share one maximum axis. Destination countries are not airline registration, passenger nationality or people counts. Top three ranks include all ties.',zh:'按所选日期和时间的实际航班记录。分区占比以全部所选航班为分母，所有条形使用同一最大值轴。目的地国家不等于航司注册国、旅客国籍或人数。前三名包含所有并列。',ja:'選択した日付・時間の物理的出発便。エリア比率の分母は選択全便、棒は同じ最大値軸です。目的地国は航空会社登録国・旅客国籍・人数ではありません。上位3位と同数を全て表示。'}[lang]}</p>{basis&&<p className="prep-note">{basis}</p>}</details>
  <div className="airport-zone-country-grid">{zones.map(zone=><div key={zone.side} data-side={zone.side} data-total={zone.total}>
   <h5>{mapCopy.side[zone.side][lang]} <span>{zone.total}{unit} · {flights.length?`${(zone.total/flights.length*100).toFixed(1)}%`:'—'}</span></h5>
   {zone.total===0?<p className="prep-note">0{unit}</p>:<ul>{zone.leaders.map(row)}</ul>}
   {zone.unknown>0&&<ul>{row({country:null,flights:zone.unknown})}</ul>}
   {zone.countries.filter(c=>c.country!==null).length>zone.leaders.length&&<details><summary>{{ko:'국가 전체 보기',en:'All countries',zh:'全部国家',ja:'国を全て表示'}[lang]} ({zone.countries.filter(c=>c.country!==null).length})</summary><ul>{zone.countries.filter(c=>c.country!==null).slice(zone.leaders.length).map(row)}</ul></details>}
  </div>)}</div>
 </section>;
}
