'use client';
import {useLayoutEffect,useRef} from 'react';
import {NOTICE_WEEK_MS,noticeDeadline,UPDATE_NOTICE_SESSION_KEY,UPDATE_NOTICE_UNTIL_KEY} from '../lib/update-notice-preference';
import './update-notice.css';

const copy={
 ko:{hourNote:"시간대별 여객 비교는 전체 공항에서만 볼 수 있어요.",countryNote:"* 최근 공개된 월의 공식 노선 국가별 출발 여객수입니다.",title:'새로운 정보가 추가되었어요',hour:'시간대별 여객 비교',hourBody:'오늘 예상과 최근 월평균을 비교해 붐비는 시간대를 쉽게 확인해요.',hourPath:'공항 → 시간대별 비교',hourLink:'시간대별 비교 보기',country:'노선 국가별 출발 여객',countryBody:'국가별 여객의 전월 대비 변화를 국기와 함께 확인해요.',countryPath:'공항 → 노선 국가별 출발 여객',countryLink:'국가별 여객 보기',close:'닫기',closeLabel:'공지 닫기',week:'일주일 동안 안 보기'},
 en:{hourNote:"Hourly passenger comparison is available for the whole airport only.",countryNote:"* Official departing passenger counts by route country for the latest published month.",title:'Airport information is easier to explore',hour:'Hourly passenger comparison',hourBody:'Compare today’s forecast with the recent monthly average to see the busier hours.',hourPath:'Airport → Hourly comparison',hourLink:'View hourly comparison',country:'Departing passengers by route country',countryBody:'See month-to-month passenger changes with country flags.',countryPath:'Airport → Passengers by route country',countryLink:'View passengers by country',close:'Close',closeLabel:'Close update notice',week:'Hide for one week'},
 zh:{hourNote:"分时段旅客比较仅支持全机场范围。",countryNote:"* 最近公布月份的官方航线国家出发旅客人数。",title:'机场信息更清晰了',hour:'分时段旅客比较',hourBody:'比较今日预测与最近月平均，轻松查看繁忙时段。',hourPath:'机场 → 分时段比较',hourLink:'查看分时段比较',country:'按航线国家统计的出发旅客',countryBody:'结合国旗查看各国旅客相较上月的变化。',countryPath:'机场 → 各航线国家出发旅客',countryLink:'查看各国旅客',close:'关闭',closeLabel:'关闭更新公告',week:'一周内不再显示'},
 ja:{hourNote:"時間帯別の旅客比較は空港全体のみでご覧いただけます。",countryNote:"* 直近の公表月における路線国別の公式出発旅客数です。",title:'空港情報が見やすくなりました',hour:'時間帯別の旅客比較',hourBody:'今日の予測と直近の月平均を比べ、混み合う時間帯を確認できます。',hourPath:'空港 → 時間帯別比較',hourLink:'時間帯別比較を見る',country:'路線の国別の出発旅客',countryBody:'国旗とともに旅客の前月からの変化を確認できます。',countryPath:'空港 → 路線の国別の出発旅客',countryLink:'国別の旅客を見る',close:'閉じる',closeLabel:'更新のお知らせを閉じる',week:'1週間表示しない'},
} as const;

export default function UpdateNotice({lang}:{lang:string}){
 const locale=lang.startsWith('zh')?'zh':lang==='en'?'en':lang==='ja'?'ja':'ko',c=copy[locale];
 const dialog=useRef<HTMLDialogElement>(null),dismiss=useRef<(week:boolean)=>void>(()=>{});
 useLayoutEffect(()=>{
  const node=dialog.current;if(!node)return;
  let timer:number|undefined,sessionFallback=false,untilFallback:string|null=null,restore:(()=>void)|null=null;
  const read=(storage:'sessionStorage'|'localStorage',key:string,fallback:string|null)=>{try{return window[storage].getItem(key)??fallback;}catch{return fallback;}};
  const unlock=()=>{restore?.();restore=null;};
  const close=()=>{if(node.open)node.close();unlock();};
  const reconcile=()=>{
   window.clearTimeout(timer);
   const until=noticeDeadline(read('localStorage',UPDATE_NOTICE_UNTIL_KEY,untilFallback),Date.now());
   if(read('sessionStorage',UPDATE_NOTICE_SESSION_KEY,sessionFallback?'1':null)==='1'){close();return;}
   if(until){close();timer=window.setTimeout(reconcile,Math.min(until-Date.now(),2_147_483_647));return;}
   if(node.open)return;
   const root=document.documentElement,body=document.body,oldRoot=root.style.overflow,oldBody=body.style.overflow;
   root.style.overflow='hidden';body.style.overflow='hidden';
   restore=()=>{root.style.overflow=oldRoot;body.style.overflow=oldBody;};
   node.showModal();
   node.querySelector<HTMLElement>('#update-notice-title')?.focus({preventScroll:true});
  };
  dismiss.current=(week)=>{
   if(week){untilFallback=String(Date.now()+NOTICE_WEEK_MS);try{localStorage.setItem(UPDATE_NOTICE_UNTIL_KEY,untilFallback);sessionStorage.removeItem(UPDATE_NOTICE_SESSION_KEY);}catch{}close();reconcile();}
   else{sessionFallback=true;try{sessionStorage.setItem(UPDATE_NOTICE_SESSION_KEY,'1');}catch{}close();}
  };
  const storage=(event:StorageEvent)=>{if(event.key===UPDATE_NOTICE_UNTIL_KEY||event.key===null){untilFallback=event.newValue;reconcile();}};
  const focus=()=>reconcile();
  window.addEventListener('storage',storage);window.addEventListener('focus',focus);
  reconcile(); // First hydration: no display-delay timer, network call or analytics event.
  return()=>{window.clearTimeout(timer);window.removeEventListener('storage',storage);window.removeEventListener('focus',focus);close();dismiss.current=()=>{};};
 },[]);
 return <dialog ref={dialog} className="update-notice" aria-labelledby="update-notice-title" aria-modal="true" onCancel={event=>{event.preventDefault();dismiss.current(false);}} onKeyDown={event=>{
  if(event.key!=='Tab')return;
  const items=event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]'),first=items[0],last=items[items.length-1];
  if(event.shiftKey&&(document.activeElement===first||document.activeElement?.id==='update-notice-title')){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}>
  <div className="update-notice-top"><span className="update-notice-new">NEW</span></div>
  <h2 id="update-notice-title" tabIndex={-1}>{c.title}</h2>
  <div className="update-notice-items">
   <section><div><h3>{c.hour}</h3><p>{c.hourBody}</p><small>{c.hourPath}</small><p className="update-notice-note">{c.hourNote}</p></div><a href={`/${locale}/airport?terminal=all#airport-hourly-comparison`} onClick={()=>dismiss.current(false)}>{c.hourLink} →</a></section>
   <section><div><h3>{c.country} <span aria-hidden="true">*</span></h3><p>{c.countryBody}</p><small>{c.countryPath}</small><p className="update-notice-note">{c.countryNote}</p></div><a href={`/${locale}/airport?terminal=all#airport-route-passengers`} onClick={()=>dismiss.current(false)}>{c.countryLink} →</a></section>
  </div>
  <footer><button type="button" className="update-notice-week" onClick={()=>dismiss.current(true)}>{c.week}</button><button type="button" className="update-notice-close" onClick={()=>dismiss.current(false)}>{c.close}</button></footer>
 </dialog>;
}
