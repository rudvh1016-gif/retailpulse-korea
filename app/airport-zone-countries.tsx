import type {Lang} from './retailpulse-data';
import type {DepartureMap} from '../lib/airport-departure-map';
import {zoneCountries,type ZoneCountry} from '../lib/airport-zone-countries';
import {zoneShareCopy} from '../lib/airport-zone-share-copy';
import {mapCopy} from '../lib/airport-departure-map-copy';
import styles from './airport-zone-countries.module.css';
import disclosureStyles from './compact-disclosure.module.css';

const locale={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const blenderFlags=new Set(['CN','JP','US','VN']);
// Other reviewed destination codes use the matching flag-icons SVG, never a Blender label.
const svgFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KR KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
const flagEmoji=(country:string)=>/^[A-Z]{2}$/.test(country)
 ? String.fromCodePoint(...[...country].map(letter=>letter.charCodeAt(0)-65+0x1f1e6))
 : null;

export function AirportZoneCountries({map,lang,basis}:{map:DepartureMap;lang:Lang;basis?:string}) {
 const flights=map.buildingScope?map.flights:map.flights.filter(f=>f.building===map.terminal);
 const zones=zoneCountries(flights);
 const unverified=zones.find(zone=>zone.side==='UNVERIFIED');
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
 return <section className="airport-zone-countries" data-testid="map-zone-countries">
  <h4>{{ko:'구역별 목적지 국가',en:'Destination countries by zone',zh:'分区目的地国家',ja:'エリア別目的地国'}[lang]}</h4>
  <p className="prep-note">{{ko:'항공편 수 기준 · 승객 국적 아님',en:'Flight counts · not passenger nationality',zh:'航班数量 · 非旅客国籍',ja:'便数基準 · 旅客国籍ではありません'}[lang]}</p>
  <details className="prep-evidence"><summary>{{ko:'집계 기준',en:'Counting basis',zh:'统计口径',ja:'集計基準'}[lang]}</summary><p className="prep-note">{{ko:'선택 날짜·시간의 물리적 출발편 기준. 구역 비중은 선택 전체 편수, 국가 비중은 해당 구역 전체 편수(목적지 미정 포함)를 분모로 합니다. 항공사 등록국가·승객 국적·사람 수가 아닙니다. 상위 3위와 동률 전원을 표시합니다.',en:'Physical departures for the selected date and time. Zone shares use all selected flights; country shares use all flights in that zone, including unknown destinations. These are not airline registration, passenger nationality or people counts. Top three ranks include all ties.',zh:'按所选日期和时间的实际出发航班。分区占比以全部所选航班为分母；国家占比以该区全部航班（含目的地未定）为分母。目的地国家不等于航司注册国、旅客国籍或人数。前三名包含所有并列。',ja:'選択した日付・時間の物理的出発便。エリア比率の分母は選択全便、国別比率の分母は目的地未定を含むそのエリアの全便です。目的地国は航空会社登録国・旅客国籍・人数ではありません。上位3位と同数を全て表示。'}[lang]}</p>{basis&&<p className="prep-note">{basis}</p>}</details>
  <p className="prep-note" data-testid="country-share-basis">{zoneShareCopy[lang].country} {zoneShareCopy[lang].rounding}</p>
  <div className="airport-zone-country-grid">{zones.filter(zone=>zone.side!=='UNVERIFIED').map(zone=>{
   const known=zone.countries.filter(item=>item.country!==null);
   const remaining=known.slice(zone.leaders.length);
   return <div key={zone.side} data-side={zone.side} data-total={zone.total}>
    <h5 className={styles.zoneHeading}>{mapCopy.side[zone.side][lang]} <span>{zone.total}{unit} · {flights.length?`${(zone.total/flights.length*100).toFixed(1)}%`:zoneShareCopy[lang].zero}</span></h5>
    {zone.total===0?<p className="prep-note">0{unit}</p>:<ul>{zone.leaders.map(item=>row(item,zone.total))}</ul>}
    {zone.unknown>0&&<ul>{row({country:null,flights:zone.unknown},zone.total)}</ul>}
    {remaining.length>0&&<details className={styles.moreCountries}><summary>{{ko:'국가 전체 보기',en:'All countries',zh:'全部国家',ja:'国を全て表示'}[lang]} ({known.length})</summary><ul>{remaining.map(item=>row(item,zone.total))}</ul></details>}
   </div>;
  })}</div>
  {unverified&&unverified.total>0&&<details className={`${styles.unverified} ${disclosureStyles.disclosure}`} data-testid="country-unverified-details" data-side="UNVERIFIED" data-total={unverified.total}>
   <summary>※ {mapCopy.side.UNVERIFIED[lang]} {unverified.total}{unit}<span className={disclosureStyles.toggle} aria-hidden="true" /></summary>
   <p className="prep-note">{zoneShareCopy[lang].basis} {unverified.total}{unit} · {(unverified.total/flights.length*100).toFixed(1)}%</p>
   <ul>{unverified.countries.map(item=>row(item,unverified.total))}</ul>
  </details>}
 </section>;
}
