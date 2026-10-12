/** Selected-month daily means descending; actual zero precedes unavailable. ISO code breaks exact ties. */
export function destinationVolumeOrder<T extends {country:string;current:number|null}>(rows:readonly T[]):T[]{
 return [...rows].sort((a,b)=>{
  if(a.current===null&&b.current!==null)return 1;
  if(b.current===null&&a.current!==null)return -1;
  return (b.current??0)-(a.current??0)||(a.country<b.country?-1:a.country>b.country?1:0);
 });
}
