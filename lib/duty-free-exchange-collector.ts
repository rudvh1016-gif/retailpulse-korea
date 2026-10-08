import { activeDutyFreeVendors, dutyFreeSources, kstExchangeDate, shiftExchangeDate, type DutyFreeVendor } from './duty-free-exchange';
import { claimDutyFreeAttempt, saveDutyFreeFailure, saveDutyFreeSuccess } from './duty-free-exchange-store';

export const DUTY_FREE_HTML_MAX_BYTES = 2 * 1024 * 1024;
export const DUTY_FREE_FETCH_TIMEOUT_MS = 12_000;
class RateFailure extends Error {
  constructor(readonly code: string, readonly blocked: boolean) { super(code); }
}
function entities(text: string) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_, value:string) => {
    const point = value[0].toLowerCase()==='x' ? parseInt(value.slice(1),16) : parseInt(value,10);
    return point>0 && point<=0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/&nbsp;/gi,' ').replace(/&dollar;/gi,'$').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}
type Widget = {context:string;targets:string[]};
/** Extract only the documented selector; scripts, products and other widgets cannot supply a fallback number. */
function widgetsFromHtml(vendor: DutyFreeVendor, html: string) {
  const clean=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const stack:Array<{tag:string;widget?:Widget;target?:{widget:Widget;text:string}}> = [];
  const widgets:Widget[]=[];
  const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let tokens=0;
  for(const token of clean.matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)) {
    if(++tokens>250_000) throw new RateFailure('HTML_COMPLEXITY',true);
    const part=token[0];
    if(part[0]!=='<') {
      for(const frame of stack){if(frame.widget)frame.widget.context+=part;if(frame.target)frame.target.text+=part;}
      continue;
    }
    const tag=/^<\/?([a-z][\w:-]*)/i.exec(part)?.[1].toLowerCase();if(!tag)continue;
    if(part.startsWith('</')) {
      const index=stack.map(frame=>frame.tag).lastIndexOf(tag);
      if(index>=0)for(const frame of stack.splice(index))if(frame.target)frame.target.widget.targets.push(entities(frame.target.text));
      continue;
    }
    const attribute=/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(part);
    const classes=(attribute?.[1]??attribute?.[2]??attribute?.[3]??'').split(/\s+/);
    const frame:{tag:string;widget?:Widget;target?:{widget:Widget;text:string}}={tag};
    if(classes.includes(vendor==='shilla'?'exchange':'todayRate')) {frame.widget={context:'',targets:[]};widgets.push(frame.widget);}
    const owner=frame.widget??[...stack].reverse().find(parent=>parent.widget)?.widget;
    if(owner&&(vendor==='shilla'?classes.includes('sum'):tag==='em'))frame.target={widget:owner,text:''};
    if(!voids.has(tag)&&!part.endsWith('/>'))stack.push(frame);
    if(stack.length>128)throw new RateFailure('HTML_COMPLEXITY',true);
  }
  return widgets;
}

export function parseDutyFreeDatedHtml(vendor: DutyFreeVendor, html: string, todayKst: string) {
  const byDate=new Map<string,{serviceDateKst:string;krwPerUnit:number;dateEvidence:'CURRENT_WIDGET'|'EXPLICIT_SOURCE_DATE'}>();
  for(const widget of widgetsFromHtml(vendor,html)) {
    const context=entities(widget.context);
    if(!/(?:\bUSD\s*1\b(?!\.)|\b1\s*USD\b|\$\s*1\b(?!\.)|\b1\s*\$)/i.test(context))continue;
    const dates=[...new Set([...context.matchAll(/\b(20\d{2})[./-](\d{2})[./-](\d{2})\b/g)].map(match=>`${match[1]}-${match[2]}-${match[3]}`))];
    if(dates.length>1||(!dates.length&&/(?:내일|\uC775일|어제|전일|tomorrow|yesterday|翌日|明日)/i.test(context)))throw new RateFailure('SOURCE_DATE_MISMATCH',true);
    const serviceDateKst=dates[0]??todayKst;
    if(!shiftExchangeDate(serviceDateKst,0)||(serviceDateKst!==todayKst&&serviceDateKst!==shiftExchangeDate(todayKst,1)))throw new RateFailure('SOURCE_DATE_MISMATCH',true);
    if(serviceDateKst!==todayKst&&!/(?:내일|\uC775일|tomorrow|翌日|明日|적용|effective)/i.test(context))throw new RateFailure('SOURCE_DATE_MISMATCH',true);
    const values:number[]=[];
    for(const target of widget.targets) {
      const numberPattern='((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)';
      const pattern=vendor==='shilla'?new RegExp(`^(?:USD\\s*1|1\\s*USD|\\$\\s*1|1\\s*\\$)\\s*[=:]\\s*${numberPattern}\\s*(?:원|KRW|₩)$`,'i'):new RegExp(`^${numberPattern}$`);
      const match=pattern.exec(target),value=match?Number(match[1].replaceAll(',','')):NaN;
      if(!Number.isFinite(value)||value<=0)throw new RateFailure('SELECTOR_UNVERIFIED',true);
      values.push(value);
    }
    if(!values.length||new Set(values).size!==1)throw new RateFailure('SELECTOR_UNVERIFIED',true);
    const existing=byDate.get(serviceDateKst);
    if(existing&&existing.krwPerUnit!==values[0])throw new RateFailure('SELECTOR_UNVERIFIED',true);
    byDate.set(serviceDateKst,{serviceDateKst,krwPerUnit:values[0],dateEvidence:dates.length?'EXPLICIT_SOURCE_DATE':'CURRENT_WIDGET'});
  }
  if(!byDate.size)throw new RateFailure('SELECTOR_UNVERIFIED',true);
  return [...byDate.values()].sort((a,b)=>a.serviceDateKst.localeCompare(b.serviceDateKst));
}
export function parseDutyFreeHtml(vendor: DutyFreeVendor, html: string, serviceDateKst: string) {
  const current=parseDutyFreeDatedHtml(vendor,html,serviceDateKst).find(row=>row.serviceDateKst===serviceDateKst);
  if(!current)throw new RateFailure('SOURCE_DATE_MISMATCH',true);
  return current.krwPerUnit;
}

async function readHtml(response: Response) {
  if(!/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type')??''))throw new RateFailure('CONTENT_TYPE_MISMATCH',true);
  const length=Number(response.headers.get('content-length'));if(length>DUTY_FREE_HTML_MAX_BYTES)throw new RateFailure('HTML_TOO_LARGE',true);
  if(!response.body)throw new RateFailure('EMPTY_HTML',true);
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>DUTY_FREE_HTML_MAX_BYTES){await reader.cancel();throw new RateFailure('HTML_TOO_LARGE',true);}parts.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const charset=/charset\s*=\s*([\w-]+)/i.exec(response.headers.get('content-type')??'')?.[1]??'utf-8';
  try{return new TextDecoder(charset,{fatal:true}).decode(bytes);}catch{throw new RateFailure('HTML_ENCODING',true);}
}

export async function collectDutyFreeExchange(db: Pick<D1Database,'prepare'|'batch'>, options:{fetchImpl?:typeof fetch;now?:()=>Date;vendors?:DutyFreeVendor[]}={}) {
  const fetchImpl=options.fetchImpl??fetch,clock=options.now??(()=>new Date());
  const outcomes:Array<{vendor:DutyFreeVendor;status:string;providerRequests:number;changedRows:number|null;errorCode?:string}>=[];
  const vendors=options.vendors??activeDutyFreeVendors;
  if(vendors.some(vendor=>!activeDutyFreeVendors.some(active=>active===vendor)))throw new Error('INACTIVE_VENDOR');
  for(const vendor of vendors) {
    const lease=crypto.randomUUID();let providerRequests=0;
    try{
      const ready=await db.prepare('SELECT vendor FROM duty_free_exchange_daily WHERE vendor=? LIMIT 1').bind(vendor).all();
      if(!ready.success)throw new Error('D1_READ_FAILED');
      if(!await claimDutyFreeAttempt(db,vendor,clock(),lease)){outcomes.push({vendor,status:'SKIPPED_NOT_DUE',providerRequests:0,changedRows:0});continue;}
      providerRequests=1;
      const response=await fetchImpl(dutyFreeSources[vendor],{headers:{accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(DUTY_FREE_FETCH_TIMEOUT_MS)});
      if(response.status!==200){await response.body?.cancel();throw new RateFailure(`HTTP_${response.status}`,response.status!==429&&response.status<500);}
      const html=await readHtml(response),verifiedAt=clock().toISOString(),serviceDateKst=kstExchangeDate(Date.parse(verifiedAt))!;
      const parsed=parseDutyFreeDatedHtml(vendor,html,serviceDateKst);
      const rows=parsed.map(row=>({...row,vendor,currency:'USD' as const,verifiedAt,sourceUrl:dutyFreeSources[vendor],verified:true as const,scope:'INTERNET_SHOP' as const}));
      const saved=await saveDutyFreeSuccess(db,rows[0],lease,rows.slice(1));
      outcomes.push({vendor,status:saved.leaseOwned?'SUCCESS':'SUPERSEDED',providerRequests,changedRows:saved.changedRows});
    }catch(error){
      const failure=error instanceof RateFailure?error:new RateFailure(providerRequests?'NETWORK_OR_STORAGE_ERROR':'STORAGE_UNAVAILABLE',false);
      let recorded=false;try{recorded=await saveDutyFreeFailure(db,vendor,lease,clock(),failure.code,failure.blocked);}catch{/* No extra provider call and no rate mutation. */}
      outcomes.push({vendor,status:recorded?(failure.blocked?'BLOCKED':'ERROR'):'ERROR',providerRequests,changedRows:0,errorCode:failure.code});
    }
  }
  return outcomes;
}
