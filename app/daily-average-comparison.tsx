import {ChangeRate,CountChange} from './change-rate';
import type {Lang} from './retailpulse-data';
import type {ReactNode} from 'react';

/** Presentation only: callers supply the unchanged, unrounded comparison. */
export function DailyAverageComparison({basis,mean,delta,percent,lang,marker,unit='flights'}:{marker?:string;basis:ReactNode;mean:number;delta:number;percent:number|null;lang:Lang;unit?:'flights'|'people'}){
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 const number=new Intl.NumberFormat(lang,{maximumFractionDigits:unit==='people'?0:1});
 const countUnit=unit==='flights'?t('편',' flights','班','便'):t('명',' people','人','人');
 const dailyUnit=unit==='flights'?t('편/일',' flights/day','班/天','便/日'):t('명/일',' people/day','人/天','人/日');
 return <><span className="daily-comparison-basis">{basis} {number.format(mean)}{countUnit}{t(' 대비 ',': ', '相比：','比：')}</span>{' '}<span className="daily-comparison-change">{marker&&`${marker} `}
  <CountChange integer={unit==='people'} delta={delta} format={number.format} lang={lang} unit={dailyUnit}/>{' '}
  {delta>0?t('증가','increase','增加','増加'):delta<0?t('감소','decrease','减少','減少'):t('차이 없음','no change','无变化','変化なし')}{' '}
  {percent===null?<span>{t('기준값 0 · 증감률 계산 불가','Zero baseline · percentage change unavailable','基准值为0 · 无法计算变化率','基準値0 · 増減率は算出不可')}</span>:<>(<ChangeRate value={percent} lang={lang}/>)</>}</span></>;
}

