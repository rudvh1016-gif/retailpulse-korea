'use client';
import {NavigationIcon} from './navigation-icon';
export function PreparationArrivalLink({onClick}:{onClick?:()=>void}){
 return <a className="preparation-arrival-link" href="#arrival-allowances" onClick={onClick}><span className="preparation-arrival-icon" aria-hidden="true"><NavigationIcon name="airport"/></span><span className="preparation-arrival-copy"><strong>도착국 반입 면세한도 확인하기</strong><small>가방·화장품·주류·담배, 입국 전 기준 확인</small></span><span className="preparation-arrival-arrow" aria-hidden="true">↗</span></a>;
}
