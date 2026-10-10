import {formatChangeRate,spokenRateText,type RateLang} from '../lib/change-rate';
export function RateText({text,lang}:{text:string;lang:RateLang}) {
  return <span role="img" aria-label={spokenRateText(text,lang)}>{text}</span>;
}
export function ChangeRate({value,lang,unit='%'}:{value:number|null;lang:RateLang;unit?:'%'|'%p'}) {
  return <RateText text={formatChangeRate(value,unit)} lang={lang}/>;
}
