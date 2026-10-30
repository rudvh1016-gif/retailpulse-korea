import type {ReactNode} from 'react';
import type {Lang} from './retailpulse-data';
import type {DepartureMap} from '../lib/airport-departure-map';
import {zoneCountries,type ZoneCountry} from '../lib/airport-zone-countries';
import {zoneShareCopy} from '../lib/airport-zone-share-copy';
import {mapCopy,windowText} from '../lib/airport-departure-map-copy';
import styles from './airport-zone-countries.module.css';
import disclosureStyles from './compact-disclosure.module.css';

const locale={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const blenderFlags=new Set(['CN','JP','US','VN']);
// Other reviewed destination codes use the matching flag-icons SVG, never a Blender label.
const svgFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KR KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
const flagEmoji=(country:string)=>/^[A-Z]{2}$/.test(country)
 ? String.fromCodePoint(...[...country].map(letter=>letter.charCodeAt(0)-65+0x1f1e6))
 : null;

export function AirportZoneCountries({map,lang,basis,source,date,isToday=false}:{map:DepartureMap;lang:Lang;basis?:string;source?:ReactNode;date:string;isToday?:boolean}) {
 const flights=map.buildingScope?map.flights:map.flights.filter(f=>f.building===map.terminal);
 const zones=zoneCountries(flights);
 const unverified=zones.find(zone=>zone.side==='UNVERIFIED');
 const gatesPending=flights.length>0&&unverified?.total===flights.length;
 const names=new Intl.DisplayNames([locale[lang]],{type:'region'});
 const unknown={ko:'목적지 국가 미정',en:'Destination country unknown',zh:'目的地国家未定',ja:'目的地国未定'}[lang];
 const unit={ko:'편',en:' flights',zh:'班',ja:'便'}[lang];
 const destinationName=(country:string)=>{
  const name=names.of(country)??country;
  return {ko:`${name}행`,en:`To ${name}`,zh:`飞往${name}`,ja:`${name}行き`}[lang];
 };
 const row=(item:ZoneCountry,total:number)=>{
  const label=item.country?destinationName(item.country):unknown;
  const share=(item.flights/total*100).toFixed(0);
  return <li className={styles.row} key={item.country??'unknown'} data-country={item.country??'UNKNOWN'} data-value={item.flights} data-share={share}>
   <span className={styles.flag} aria-hidden="true">{item.country&&blenderFlags.has(item.country)
    ? <img src={`/images/airport-flags/${item.country}.webp`} width="36" height="36" alt="" loading="lazy" decoding="async"/>
    : item.country&&svgFlags.has(item.country)
    ? <img src={`/images/airport-flags/fallback/${item.country.toLowerCase()}.svg`} width="36" height="36" alt="" loading="lazy" decoding="async"/>
    : item.country?flagEmoji(item.country):'—'}</span>
   <span className={styles.name}>{label}</span>{' '}
   <span className={styles.value}><strong className={styles.count}>{item.flights}{unit}</strong>{' '}<small className={styles.share}>{share}%</small></span>
  </li>;
 };
 return <section id="airport-zone-countries" className="airport-zone-countries" data-testid="map-zone-countries">
  <h4 className={styles.heading} data-testid="daily-country-heading">{isToday?{ko:'오늘의 국가별 출발편',en:'Today’s departures by destination country',zh:'今日各目的地国家出发航班',ja:'今日の行き先国別出発便'}[lang]:{ko:`${date} 국가별 출발편`,en:`${date} departures by destination country`,zh:`${date} 各目的地国家出发航班`,ja:`${date} 行き先国別出発便`}[lang]} · {windowText(map.window,lang)}</h4>
  <details className="prep-evidence" data-testid="country-counting-details">
   <summary>{source?{ko:'집계 기준·수집 시각',en:'Counting basis & collection time',zh:'统计口径与采集时间',ja:'集計基準・収集日時'}[lang]:{ko:'집계 기준',en:'Counting basis',zh:'统计口径',ja:'集計基準'}[lang]}</summary>
   <p className="prep-note">{{ko:'선택 날짜·시간의 목적지별 출발편 기준 · 승객 국적·사람 수 아님. 상위 3위와 동률을 표시합니다.',en:'Departures by destination for the selected date and time, not passenger nationality or people counts. Top three ranks include ties.',zh:'按所选日期和时间的目的地出发航班统计，非旅客国籍或人数。显示前三名及并列。',ja:'選択日時の行き先別出発便が基準です。旅客国籍・人数ではありません。上位3位と同数を表示します。'}[lang]}</p>
   <p className="prep-note">{{ko:'구역 비율: 선택한 전체 출발편 기준, 위치 미확인 포함.',en:'Zone shares: all selected departures, including unverified locations.',zh:'区域比例：所选全部出发航班，包括位置未确认的航班。',ja:'区域の割合：位置未確認を含む選択した全出発便が基準です。'}[lang]}</p>
   <p className="prep-note" data-testid="country-share-basis">{zoneShareCopy[lang].country} {zoneShareCopy[lang].rounding}</p>
   {basis&&<p className="prep-note">{basis}</p>}
   {source}
  </details>
  {gatesPending&&<p className="prep-note" role="status" data-testid="country-gates-pending">{zoneShareCopy[lang].gatesPending}</p>}
  <div className="airport-zone-country-grid">{!gatesPending&&zones.filter(zone=>zone.side!=='UNVERIFIED').map(zone=>{
   const known=zone.countries.filter(item=>item.country!==null);
   const remaining=known.slice(zone.leaders.length);
   return <div key={zone.side} data-side={zone.side} data-total={zone.total}>
    <h5 className={styles.zoneHeading}>{mapCopy.side[zone.side][lang]} <span className={styles.zoneTotal}><strong>{zone.total}{unit}</strong>{' '}<small>{flights.length?`${(zone.total/flights.length*100).toFixed(0)}%`:zoneShareCopy[lang].zero}</small></span></h5>
    {zone.total===0?<p className="prep-note">0{unit}</p>:<ul>{zone.leaders.map(item=>row(item,zone.total))}</ul>}
    {zone.unknown>0&&<ul>{row({country:null,flights:zone.unknown},zone.total)}</ul>}
    {remaining.length>0&&<details className={styles.moreCountries}><summary>{{ko:'국가 전체 보기',en:'All countries',zh:'全部国家',ja:'国を全て表示'}[lang]} <span data-disclosure-meta>({known.length})</span></summary><ul>{remaining.map(item=>row(item,zone.total))}</ul></details>}
   </div>;
  })}</div>
  {unverified&&unverified.total>0&&<details className={`${styles.unverified} ${disclosureStyles.disclosure}`} data-testid="country-unverified-details" data-side="UNVERIFIED" data-total={unverified.total}>
   <summary><span>※ {mapCopy.side.UNVERIFIED[lang]} <strong className={styles.unverifiedCount}>{unverified.total}{unit}</strong></span><span className={disclosureStyles.toggle} aria-hidden="true" /></summary>
   <p className="prep-note">{zoneShareCopy[lang].basis} {unverified.total}{unit} · {(unverified.total/flights.length*100).toFixed(0)}%</p>
   <ul>{unverified.countries.map(item=>row(item,unverified.total))}</ul>
  </details>}
 </section>;
}
