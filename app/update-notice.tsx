'use client';
import {useLayoutEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {NOTICE_WEEK_MS,noticeDeadline,UPDATE_NOTICE_TITLE,UPDATE_NOTICE_OPEN_EVENT,UPDATE_NOTICE_SESSION_KEY,UPDATE_NOTICE_UNTIL_KEY} from '../lib/update-notice-preference';
import './update-notice.css';
import ReferenceChangeNotices from './reference-change-notices';

const copy={
 ko:{reportTitle:'외국인은 뭘 살까?',reportBody:'방한 외국인의 구매 품목·쇼핑 장소와 판판면세점 6개 매장의 판매 구성을 확인하세요.',reportLink:'보고서 보기',updated:'업데이트 기준',close:'닫기',closeLabel:'공지 닫기',week:'일주일 동안 안 보기'},
 en:{reportTitle:'What do foreign visitors buy?',reportBody:'See visitors’ purchases and shopping places, plus the sales mix of six Panpan duty-free stores.',reportLink:'Read report (Korean)',updated:'Updated',close:'Close',closeLabel:'Close update notice',week:'Hide for one week'},
 zh:{reportTitle:'外国游客买什么？',reportBody:'查看访韩游客的购买品类、购物地点和6家Panpan免税店的销售构成。',reportLink:'查看报告（韩文）',updated:'更新日期',close:'关闭',closeLabel:'关闭更新公告',week:'一周内不再显示'},
 ja:{reportTitle:'外国人旅行者は何を買う？',reportBody:'訪韓客の購入品目・買い物先と、Panpan免税店6店舗の販売構成を確認できます。',reportLink:'レポートを見る（韓国語）',updated:'更新日',close:'閉じる',closeLabel:'更新のお知らせを閉じる',week:'1週間表示しない'},
} as const;

export default function UpdateNotice({lang}:{lang:string}){
 const preview=usePathname()?.endsWith('/airport-focus-preview')??false;
 const locale=lang.startsWith('zh')?'zh':lang==='en'?'en':lang==='ja'?'ja':'ko',c=copy[locale];
 const focusNotice=preview||locale==='ko';
 const calendarHref=preview?`/${locale}/airport-focus-preview?view=prepare`:`/${locale}/airport-prepare`;
 const allowanceHref=preview?`/${locale}/airport-focus-preview?view=prepare&section=arrival#arrival-allowances`:`/${locale}/airport-prepare#arrival-allowances`;
 const dialog=useRef<HTMLDialogElement>(null),dismiss=useRef<(week:boolean)=>void>(()=>{});
 useLayoutEffect(()=>{
  const node=dialog.current;if(!node)return;
  let timer:number|undefined,sessionFallback=false,explicitOpen=false,untilFallback:string|null=null,restore:(()=>void)|null=null;
  const read=(storage:'sessionStorage'|'localStorage',key:string,fallback:string|null)=>{try{return window[storage].getItem(key)??fallback;}catch{return fallback;}};
  const unlock=()=>{restore?.();restore=null;};
  const close=()=>{if(node.open)node.close();unlock();};
  const reconcile=()=>{
   window.clearTimeout(timer);
   const until=noticeDeadline(read('localStorage',UPDATE_NOTICE_UNTIL_KEY,untilFallback),Date.now());
   if(!explicitOpen&&read('sessionStorage',UPDATE_NOTICE_SESSION_KEY,sessionFallback?'1':null)==='1'){close();return;}
   if(!explicitOpen&&until){close();timer=window.setTimeout(reconcile,Math.min(until-Date.now(),2_147_483_647));return;}
   if(node.open)return;
   const root=document.documentElement,body=document.body,oldRoot=root.style.overflow,oldBody=body.style.overflow;
   root.style.overflow='hidden';body.style.overflow='hidden';
   restore=()=>{root.style.overflow=oldRoot;body.style.overflow=oldBody;};
   node.showModal();
   node.querySelector<HTMLElement>('#update-notice-title')?.focus({preventScroll:true});
  };
  dismiss.current=(week)=>{
   explicitOpen=false;
   if(week){sessionFallback=false;untilFallback=String(Date.now()+NOTICE_WEEK_MS);try{localStorage.setItem(UPDATE_NOTICE_UNTIL_KEY,untilFallback);sessionStorage.removeItem(UPDATE_NOTICE_SESSION_KEY);}catch{}close();reconcile();}
   else{sessionFallback=true;try{sessionStorage.setItem(UPDATE_NOTICE_SESSION_KEY,'1');}catch{}close();}
  };
  const storage=(event:StorageEvent)=>{if(event.key===UPDATE_NOTICE_UNTIL_KEY||event.key===null){untilFallback=event.newValue;reconcile();}};
  const focus=()=>reconcile();
  // Viewing on demand is temporary: do not erase the saved snooze or any preferences.
  const reopen=()=>{explicitOpen=true;reconcile();};
  window.addEventListener('storage',storage);window.addEventListener('focus',focus);window.addEventListener(UPDATE_NOTICE_OPEN_EVENT,reopen);
  reconcile(); // First hydration: no display-delay timer, network call or analytics event.
  return()=>{window.clearTimeout(timer);window.removeEventListener('storage',storage);window.removeEventListener('focus',focus);window.removeEventListener(UPDATE_NOTICE_OPEN_EVENT,reopen);close();dismiss.current=()=>{};};
 },[]);
 return <dialog ref={dialog} className="update-notice" data-airport-focus={focusNotice?'true':undefined} aria-labelledby="update-notice-title" aria-modal="true" onCancel={event=>{event.preventDefault();dismiss.current(false);}} onKeyDown={event=>{
  if(event.key!=='Tab')return;
  const items=event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]'),first=items[0],last=items[items.length-1];
  if(event.shiftKey&&(document.activeElement===first||document.activeElement?.id==='update-notice-title')){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}>
  <div className="update-notice-top"><span className="update-notice-new">NEW</span></div>
  <h2 data-heading="section" id="update-notice-title" tabIndex={-1}><span className="heading-marker" aria-hidden="true"/>{UPDATE_NOTICE_TITLE}</h2><small className="update-notice-date">{c.updated} <time dateTime="2026-11-01">{new Intl.DateTimeFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[locale],{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date('2026-11-01T00:00:00Z'))}</time></small>
  <div className="update-notice-items">
   {focusNotice&&<ReferenceChangeNotices dialog={dialog} calendarHref={calendarHref} allowanceHref={allowanceHref} onNavigate={()=>dismiss.current(false)}/>}
   {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- The standalone static report requires full document navigation. */}
   <section><div><h3>{c.reportTitle}</h3><p>{c.reportBody}</p></div><a href="/shopping-report/index.html" onClick={()=>dismiss.current(false)}>{c.reportLink} →</a></section>
  </div>
  <footer><button type="button" className="update-notice-week" onClick={()=>dismiss.current(true)}>{c.week}</button><button type="button" className="update-notice-close" onClick={()=>dismiss.current(false)}>{c.close}</button></footer>
 </dialog>;
}

