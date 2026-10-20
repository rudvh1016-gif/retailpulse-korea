import {formatChangeRate,spokenRateText,type RateLang} from '../lib/change-rate';
import './change-rate.css';
export function RateText({text,lang}:{text:string;lang:RateLang}) {
  if(text==='—')return <span className="change-rate" data-direction="neutral" role="img" aria-label={spokenRateText(text,lang)}>{text}</span>;
  const parts=text.split(/((?:▲ \+|▽ −)<?[\d,.]+(?:%p|%)?|(?<![\d.])0(?:%p|%|(?=[편班便]|\s+(?:flights|편|班|便))))/g);
  return <span role="img" aria-label={spokenRateText(text,lang)}>{parts.map((part,index)=>/^(?:▲|▽|0(?:%|$))/.test(part)?<span key={index} className="change-rate" data-direction={part.startsWith('▲')?'up':part.startsWith('▽')?'down':'neutral'}>{part}</span>:part)}</span>;
}
export function ChangeRate({value,lang,unit='%'}:{value:number|null;lang:RateLang;unit?:'%'|'%p'}) {
  return <RateText text={formatChangeRate(value,unit)} lang={lang}/>;
}
