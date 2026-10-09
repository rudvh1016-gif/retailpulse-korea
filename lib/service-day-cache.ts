/** Never serve a cached day relation past its KST midnight boundary. */
export function serviceDayCacheControl(value:string,nowIso:string):string {
 const now=Date.parse(nowIso);if(!Number.isFinite(now)||value.includes('no-store'))return value;
 const day=new Date(now+9*3_600_000).toISOString().slice(0,10);
 const remaining=Math.max(0,Math.floor((Date.parse(day+'T00:00:00+09:00')+86_400_000-now)/1000));
 const age=Number(value.match(/(?:^|[, ])max-age=(\d+)/)?.[1]??0);
 const capped=Math.min(age,remaining);
 return value.replace(/max-age=\d+/,`max-age=${capped}`).replace(/stale-while-revalidate=(\d+)/,(_,n)=>`stale-while-revalidate=${Math.min(Number(n),Math.max(0,remaining-capped))}`);
}
