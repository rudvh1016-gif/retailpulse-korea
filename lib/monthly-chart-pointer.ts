/** Map viewport coordinates to the nearest plotted month, including chart margins. */
export function nearestMonthlyPoint(clientX:number,left:number,renderedWidth:number,count:number):number|null{
 if(!Number.isFinite(clientX)||!Number.isFinite(left)||!Number.isFinite(renderedWidth)||renderedWidth<=0||!Number.isInteger(count)||count<1)return null;
 if(count===1)return 0;
 const plotX=(clientX-left)/renderedWidth*332;
 return Math.max(0,Math.min(count-1,Math.round((plotX-48)/256*(count-1))));
}
