/** Presentation only: stable descending order; published zero precedes missing.
 * Callers choose the exact metric already displayed. Source arrays stay unchanged.
 */
export function rankPublishedMetric<T>(rows:readonly T[],metric:(row:T)=>number|null|undefined):T[]{
 const value=(row:T)=>{const n=metric(row);return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;};
 return [...rows].sort((a,b)=>{const x=value(a),y=value(b);return x===null?(y===null?0:1):y===null?-1:y-x;});
}
