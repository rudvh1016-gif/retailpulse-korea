import {comparisonValue,type RangeChange} from './period-comparison';
import type {Lang} from '../app/retailpulse-data';
/** Presentation only: retain the published range and original baseline time. */
export function airportComparisonSentence(current:number,change:RangeChange,kind:'people'|'flights',days:7|28,lang:Lang){
 if(!Number.isFinite(current)||current<0||![change.minPercent,change.maxPercent].every(Number.isFinite)||change.minPercent>change.maxPercent)return null;
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang],n=new Intl.NumberFormat(lang,{maximumFractionDigits:0});
 const metric=kind==='people'?t('출국장 예상 승객','Forecast departure-hall passengers','出境大厅预计旅客','出国場予想旅客数'):t('출발편','Departures','出发航班','出発便');
 const when=days===7?t('지난주 같은 요일보다','vs the same weekday last week','较上周同日','先週の同じ曜日比'):t('4주 전 같은 요일보다','vs the same weekday four weeks ago','较4周前同日','4週前の同じ曜日比');
 const unit=kind==='people'?t('명',' people','人','人'):t('편',' flights','班','便');
 const exact=Math.abs(change.minPercent-change.maxPercent)<.00001,r=change.minPercent;
 const magnitude=(value:number)=>Math.abs(value)>0&&Math.round(Math.abs(value))===0?'<1':n.format(Math.round(Math.abs(value)));
 const direction=r>0?t('증가','increase','增加','増加'):r<0?t('감소','decrease','减少','減少'):t('변화 없음','no change','无变化','変化なし');
 const base=change.baselineMin;
 if(exact&&base!==undefined&&Number.isFinite(base)&&base>0&&base===change.baselineMax&&Math.abs((current/base-1)*100-r)>=.00001)return null;
 const verifiedCount=kind==='flights'&&exact&&Number.isSafeInteger(base)&&base!>0&&base===change.baselineMax&&Number.isSafeInteger(current);
 let sentence:string;
 if(exact){
  const rate=`${magnitude(r)}%`,count=verifiedCount?`${n.format(Math.abs(current-base!))}${unit}`:null;
  sentence=lang==='ko'?`${when} ${metric} ${r===0?direction:count?`${count} ${direction} (${rate})`:`${rate} ${direction}`}`:lang==='en'?`${metric}: ${r===0?'unchanged':count?`${r>0?'up':'down'} ${count} (${rate})`:`${r>0?'up':'down'} ${rate}`} ${when}`:lang==='zh'?`${when}，${metric}${r===0?direction:count?`${direction}${count}（${rate}）`:`${direction}${rate}`}`:`${when}、${metric}${r===0?direction:count?`${count}${direction}（${rate}）`:`${rate}${direction}`}`;
 }else sentence=`${when} · ${metric} · ${t('변화 범위','change range','变化范围','変化範囲')} ${comparisonValue(change)}`;
 const baseline=base!==undefined&&change.baselineMax!==undefined?`${n.format(base)}${base===change.baselineMax?'':` ~ ${n.format(change.baselineMax)}`}${unit}`:null;
 const basis=`${t('선택일','Selected day','所选日','選択日')} ${n.format(current)}${unit}${baseline?` · ${t('비교일','Baseline','比较日','比較日')} ${baseline}`:''} · ${change.baselineAt.replace('T',' ').replace('+09:00',' KST')}`;
 return {sentence,basis};
}
