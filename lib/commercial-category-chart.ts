import type {CategoryActivity} from './seoul-context';

export type CommercialChartMetric = 'payments' | 'amount';
export interface CommercialChartAxes {payments:number; amount:number;hasPayments:boolean;hasAmounts:boolean}
export interface CommercialPrismRange {lower:number; upper:number; zero:boolean}

export function publishedPaymentCount(value:number|null):number|null {
  return value!==null&&Number.isFinite(value)&&Number.isInteger(value)&&value>=0?value:null;
}
export function publishedAmountRange(min:number|null,max:number|null):[number,number]|null {
  return min!==null&&max!==null&&Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min?[min,max]:null;
}
/** Shared axes include the complete published list, even while only three rows are shown. */
export function commercialChartAxes(rows:readonly CategoryActivity[]):CommercialChartAxes {
  return rows.reduce<CommercialChartAxes>((axes,row)=>{
    const count=publishedPaymentCount(row.payments),range=publishedAmountRange(row.amountMin,row.amountMax);
    const publishedUpper=range?.[1]??(row.amountMin===null&&row.amountMax!==null&&Number.isFinite(row.amountMax)&&row.amountMax>=0?row.amountMax:0);
    return {payments:Math.max(axes.payments,count??0),amount:Math.max(axes.amount,publishedUpper),
      hasPayments:axes.hasPayments||count!==null,hasAmounts:axes.hasAmounts||range!==null};
  },{payments:0,amount:0,hasPayments:false,hasAmounts:false});
}
/** The front face alone encodes data; depth is constant and activity grades are never read. */
export function commercialPrismRange(row:CategoryActivity,metric:CommercialChartMetric,axes:CommercialChartAxes):CommercialPrismRange|null {
  const count=publishedPaymentCount(row.payments);
  const range=metric==='payments'?(count===null?null:[count,count]):publishedAmountRange(row.amountMin,row.amountMax);
  if(!range)return null;
  const maximum=axes[metric];
  if(!Number.isFinite(maximum)||maximum<range[1]||maximum<0)return null;
  return {lower:maximum?range[0]/maximum*100:0,upper:maximum?range[1]/maximum*100:0,zero:range[1]===0};
}
