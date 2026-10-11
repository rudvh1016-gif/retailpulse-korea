/** Compact only consecutive retained dates. A gap must remain visible. */
export function comparisonDateMembership(values:readonly string[],showYear=false):string|null {
 if(values.some(value=>!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))return null;
 const dates=[...new Set(values)].sort();
 const label=(value:string)=>`${showYear?value.slice(0,4)+'/':''}${Number(value.slice(5,7))}/${Number(value.slice(8))}`;
 const groups:string[]=[];
 for(let i=0;i<dates.length;i++){
  const first=dates[i];let last=first;
  while(i+1<dates.length&&Date.parse(dates[i+1]+'T00:00:00Z')-Date.parse(last+'T00:00:00Z')===86_400_000){last=dates[++i];}
  groups.push(first===last?label(first):`${label(first)}–${label(last)}`);
 }
 return groups.join(', ');
}
