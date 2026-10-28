// Presentation only: the analysis model owns both the value and included dates.
export function rhythmMetricCopy(coverage,scope,role){
 const {start,end,days,expected}=coverage;
 const month=start.slice(0,7),last=new Date(Date.UTC(Number(start.slice(0,4)),Number(start.slice(5,7)),0)).getUTCDate();
 const wholeMonth=start===month+'-01'&&end===month+'-'+String(last).padStart(2,'0');
 const short=date=>Number(date.slice(5,7))+'/'+Number(date.slice(8,10));
 const period=wholeMonth?Number(start.slice(5,7))+'월':start===end?short(start):short(start)+'–'+short(end);
 return {label:period+' 하루 평균 출발편',period:role+' · '+start+'–'+end+' · 포함 '+days+'/'+expected+'일',basis:scope+' · 24시간 출발편 합계 ÷ 포함 '+days+'일'};
}
