import {formatChangeRate,formatCountChange,spokenRateText,type RateLang} from '../lib/change-rate';
/** Only comparison text enters this component, never temperatures or congestion status. */
export function RateText({text,lang}:{text:string;lang:RateLang}) {
  if(text==='—')return <span className="change-rate" data-direction="neutral" role="img" aria-label={spokenRateText(text,lang)}>{text}</span>;
  const parts=text.split(/((?:△ |\+)<?[\d,.]+(?:%p|%)?|(?<![\d.])0(?:%p|%|(?=[명편班便人]|\s+(?:people|flights|명|편|班|便|人))))/g);
  return <span role="img" aria-label={spokenRateText(text,lang)}>{parts.map((part,index)=>/^(?:△ |\+|0(?:%|$))/.test(part)?<span key={index} className="change-rate" data-direction={part.startsWith('+')?'up':part.startsWith('△ ')?'down':'neutral'}>{part}</span>:part)}</span>;
}
export function ChangeRate({value,lang,unit='%'}:{value:number|null;lang:RateLang;unit?:'%'|'%p'}) {
  return <RateText text={formatChangeRate(value,unit)} lang={lang}/>;
}
/** Count/day units stay outside the formatter; only presentation uses absolute magnitude. */
export function CountChange({delta,format,lang,unit='',integer=false}:{delta:number|null;format:(value:number)=>string;lang:RateLang;unit?:string;integer?:boolean}){
  const text=formatCountChange(delta,format,integer);
  const direction=delta===null||!Number.isFinite(delta)||delta===0?'neutral':delta>0?'up':'down';
  return <span className="glance-count-change change-rate" data-direction={direction} data-delta={direction==='neutral'?undefined:direction}><span aria-hidden="true">{text}{unit}</span><span className="sr-only">{spokenRateText(text+unit,lang)}</span></span>;
}
