import {airportComparisonSentence} from '../lib/airport-comparison-sentence';
import type {RangeChange} from '../lib/period-comparison';
import type {Lang} from './retailpulse-data';
export function AirportPeriodSentence({current,change,kind,days,lang}:{current:number;change:RangeChange;kind:'people'|'flights';days:7|28;lang:Lang}){
 const copy=airportComparisonSentence(current,change,kind,days,lang);
 return copy?<p className="airport-comparison-sentence" data-kind={kind} data-days={days}>{copy.sentence}<small>{copy.basis}</small></p>:null;
}
