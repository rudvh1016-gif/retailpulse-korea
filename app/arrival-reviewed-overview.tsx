import type {ArrivalCountry} from '../lib/arrival-allowance-guidance';
import {arrivalVerifiedDate,arrivalManualReviewLabel} from '../lib/arrival-review-date';
type ReviewedCountry=ArrivalCountry & {reviewStatus?:string};
/** Visible Korean source orientation, not a selected traveler's allowance. */
export function ArrivalReviewedOverview({countries}:{countries:readonly ReviewedCountry[]}){
 return <section className="arrival-reviewed-overview" aria-labelledby="arrival-reviewed-title" lang="ko" data-testid="arrival-reviewed-overview">
  <h3 id="arrival-reviewed-title">국가별 적용 범위와 공식 근거</h3>
  <p>여행자 조건을 고르기 전 확인할 안내입니다. 아래는 저장된 표시 내용의 확인 기록이며, 모든 최신 개정이나 특수 조건의 검증을 뜻하지 않습니다.</p>
  <ul>{countries.map(country=><li key={country.id} data-country={country.id}>
   <h4>{country.name}</h4>{arrivalVerifiedDate(country)?<><p>{country.scope}</p><p>선택할 조건: {country.conditions.map(condition=>condition.label).join(' · ')}</p></>:<p>수동 확인일과 적용 기준을 추가로 검토해야 합니다. 세관 원문을 확인하세요.</p>}
   <small>{arrivalManualReviewLabel(country)} · {country.effectiveLabel}{country.reviewStatus==='partial_verified_alcohol_tobacco_withheld'?' · 일부 확인, 주류·담배 기준 표시 보류':country.reviewStatus?.includes('pending')?' · 추가 검토 필요':''}</small>
   {country.sources[0]&&<a href={country.sources[0].url} target="_blank" rel="noreferrer">{country.sources[0].label} ↗</a>}
  </li>)}</ul>
 </section>;
}
