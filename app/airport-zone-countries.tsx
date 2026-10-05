import {useId,type ReactNode} from 'react';
import type {Lang} from './retailpulse-data';
import type {DepartureMap} from '../lib/airport-departure-map';
import {zoneCountries,type ZoneCountry} from '../lib/airport-zone-countries';
import {zoneShareCopy} from '../lib/airport-zone-share-copy';
import {mapCopy} from '../lib/airport-departure-map-copy';
import styles from './airport-zone-countries.module.css';

const locale={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const blenderFlags=new Set(['CN','JP','US','VN']);
// Other reviewed destination codes use the matching flag-icons SVG, never a Blender label.
const svgFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KR KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
const flagEmoji=(country:string)=>/^[A-Z]{2}$/.test(country)
 ? String.fromCodePoint(...[...country].map(letter=>letter.charCodeAt(0)-65+0x1f1e6))
 : null;

export function AirportZoneCountries({map,lang,basis,referenceNotes}:{map:DepartureMap;lang:Lang;basis?:string;referenceNotes?:ReactNode}) {
 const headingId=useId();
 const hintId=useId();
 const flights=map.buildingScope?map.flights:map.flights.filter(f=>f.building===map.terminal);
 const zones=zoneCountries(flights);
 const names=new Intl.DisplayNames([locale[lang]],{type:'region'});
 const unknown={ko:'목적지 국가 미정',en:'Destination country unknown',zh:'目的地国家未定',ja:'目的地国未定'}[lang];
 const unit={ko:'편',en:' flights',zh:'班',ja:'便'}[lang];
 const destinationName=(country:string)=>{
  const name=names.of(country)??country;
  return {ko:`${name}행`,en:`To ${name}`,zh:`飞往${name}`,ja:`${name}行き`}[lang];
 };
 const row=(item:ZoneCountry,total:number)=>{
  const label=item.country?destinationName(item.country):unknown;
  const share=(item.flights/total*100).toFixed(1);
  return <li className={styles.row} key={item.country??'unknown'} data-country={item.country??'UNKNOWN'} data-value={item.flights} data-share={share}>
   <span className={styles.flag} aria-hidden="true">{item.country&&blenderFlags.has(item.country)
    ? <img src={`/images/airport-flags/${item.country}.webp`} width="36" height="36" alt="" loading="lazy" decoding="async"/>
    : item.country&&svgFlags.has(item.country)
    ? <img src={`/images/airport-flags/fallback/${item.country.toLowerCase()}.svg`} width="36" height="36" alt="" loading="lazy" decoding="async"/>
    : item.country?flagEmoji(item.country):'—'}</span>
   <span className={styles.name}>{label}</span>
   <strong className={styles.value}>{item.flights}{unit} · {share}%</strong>
  </li>;
 };
 const zoneCard=(zone:(typeof zones)[number])=>{
  const known=zone.countries.filter(item=>item.country!==null);
  const remaining=known.slice(zone.leaders.length);
  return <div className={zone.side==='UNVERIFIED'?styles.unverified:styles.zone} key={zone.side} data-side={zone.side} data-total={zone.total}>
   <h5>{mapCopy.side[zone.side][lang]} <span>{zone.total}{unit} · {flights.length?`${(zone.total/flights.length*100).toFixed(1)}%`:zoneShareCopy[lang].zero}</span></h5>
   {zone.total===0?<p className="prep-note">0{unit}</p>:<ul>{zone.leaders.map(item=>row(item,zone.total))}</ul>}
   {zone.unknown>0&&<ul>{row({country:null,flights:zone.unknown},zone.total)}</ul>}
   {remaining.length>0&&<details className={styles.moreCountries}><summary>{{ko:'국가 전체 보기',en:'All countries',zh:'全部国家',ja:'国を全て表示'}[lang]} ({known.length})</summary><ul>{remaining.map(item=>row(item,zone.total))}</ul></details>}
  </div>;
 };
 return <section className="airport-zone-countries" data-testid="map-zone-countries">
  <details className="prep-evidence prep-estimate-details" data-testid="airport-comparison-notes"><summary>{{ko:'주의사항',en:'Notes',zh:'注意事项',ja:'注意事項'}[lang]}</summary>
   {referenceNotes}
   <p className="prep-note">{{ko:'목적지 국가와 비중은 선택 날짜·시간의 출발 항공편 기준이며, 항공사 등록국가·승객 국적·사람 수를 뜻하지 않습니다. 구역 비중은 선택 전체 항공편(위치 미확인 포함) 기준입니다. 상위 3위와 동률 전원을 표시합니다.',en:'Destination countries and shares describe departures for the selected date and time, not airline registration, passenger nationality or people counts. Zone shares use all selected flights, including unconfirmed locations. Top three ranks include all ties.',zh:'目的地国家及占比按所选日期和时间的出发航班统计，不代表航司注册国、旅客国籍或人数。分区占比以全部所选航班（含位置未确认）为分母。前三名包含所有并列。',ja:'目的地国と比率は選択した日付・時間の出発便が基準で、航空会社登録国・旅客国籍・人数を示しません。エリア比率の分母は位置未確認を含む選択全便です。上位3位と同数を全て表示します。'}[lang]}</p>
   <p className="prep-note" data-testid="country-share-basis">{zoneShareCopy[lang].country} {zoneShareCopy[lang].rounding}</p>
   {basis&&<p className="prep-note">{basis}</p>}
  </details>
  <h4 id={headingId}>{{ko:'구역별 목적지 국가',en:'Destination countries by zone',zh:'分区目的地国家',ja:'エリア別目的地国'}[lang]}</h4>
  <p className={`prep-note ${styles.scrollHint}`} id={hintId}>{(['WEST','CENTER','EAST'] as const).map(side=>mapCopy.side[side][lang]).join(' · ')}{' — '}
   {{ko:'좌우로 넘겨 비교',en:'Scroll sideways to compare',zh:'左右滑动比较',ja:'左右にスクロールして比較'}[lang]}</p>
  <div className={styles.comparison} role="region" tabIndex={0} aria-labelledby={headingId} aria-describedby={hintId} data-testid="country-zone-comparison">
   <div className={`airport-zone-country-grid ${styles.grid}`}>{zones.filter(zone=>zone.side!=='UNVERIFIED').map(zoneCard)}</div>
  </div>
  {zones.filter(zone=>zone.side==='UNVERIFIED').map(zoneCard)}
 </section>;
}
