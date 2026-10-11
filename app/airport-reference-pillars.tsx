import type { CSSProperties } from 'react';
import type { Lang } from './retailpulse-data';
import type { ReferencePillar } from '../lib/airport-reference-pillars';
import './airport-reference-pillars.css';

const copy = {
  ko: { EAST:'동편',WEST:'서편',CENTER:'중앙',CONCOURSE:'탑승동',about:'약 ',unit:'명',under:'100명 미만',flights:'편',basis:'길이: 반올림 전 추정값 · 표시값: 100명 단위 반올림' },
  en: { EAST:'East',WEST:'West',CENTER:'Center',CONCOURSE:'Concourse',about:'about ',unit:' people',under:'under 100',flights:' flights',basis:'Length: unrounded estimate · Label: rounded to 100 people' },
  zh: { EAST:'东侧',WEST:'西侧',CENTER:'中央',CONCOURSE:'登机楼',about:'约',unit:'人',under:'不足100人',flights:'班',basis:'长度：未取整估算 · 数值：取整至100人' },
  ja: { EAST:'東側',WEST:'西側',CENTER:'中央',CONCOURSE:'搭乗棟',about:'約',unit:'人',under:'100人未満',flights:'便',basis:'長さ：丸め前の推定 · 表示：100人単位に丸め' },
} as const;
const locales = {ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const;

export function AirportReferencePillars({ lang, pillars, maximum }: {lang:Lang;pillars:ReferencePillar[];maximum:number}) {
  const words=copy[lang], number=new Intl.NumberFormat(locales[lang]);
  return <figure className="airport-reference-pillars" data-testid="airport-reference-pillars" data-basis="EQUAL_PASSENGERS_PER_FLIGHT_ESTIMATE" data-scale-max={maximum}>
    <ul className="reference-pillar-list">{pillars.map(part=>{
      const width=maximum>0?100*part.rawPeople/maximum:0;
      const value=part.rawPeople===0?`0${words.unit}`:part.people===0?words.under:`${words.about}${number.format(part.people)}${words.unit}`;
      return <li key={part.zone} data-zone={part.zone} data-raw-value={part.rawPeople} data-width-percent={width}>
        <span className="reference-pillar-zone">{words[part.zone]}</span>
        <strong className="reference-pillar-value">{value}</strong>
        <small>{number.format(part.flights)}{words.flights}</small>
        <div className="reference-pillar-space" aria-hidden="true">
          {width>0 && <span className="reference-pillar" style={{'--estimate-width':`${width}%`} as CSSProperties}/>}
        </div>
      </li>;
    })}</ul>
    <figcaption className="prep-note">{words.basis}</figcaption>
  </figure>;
}
