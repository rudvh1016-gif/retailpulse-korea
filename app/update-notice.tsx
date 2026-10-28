'use client';
import {useLayoutEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {NOTICE_WEEK_MS,noticeDeadline,UPDATE_NOTICE_TITLE,UPDATE_NOTICE_OPEN_EVENT,UPDATE_NOTICE_SESSION_KEY,UPDATE_NOTICE_UNTIL_KEY} from '../lib/update-notice-preference';
import './update-notice.css';
import ReferenceChangeNotices from './reference-change-notices';

const copy={
 ko:{hourNote:"시간대별 여객 비교는 전체 공항에서만 볼 수 있어요.",countryNote:"* 최근 공개된 월의 공식 노선 국가별 출발 여객수입니다.",hour:'시간대별 여객 비교',hourBody:'오늘 예상과 최근 월평균을 비교해 붐비는 시간대를 쉽게 확인해요.',hourPath:'공항 → 시간대별 비교',hourLink:'시간대별 비교 보기',country:'노선 국가별 출발 여객',countryBody:'국가별 여객의 전월 대비 변화를 국기와 함께 확인해요.',countryPath:'공항 → 노선 국가별 출발 여객',countryLink:'국가별 여객 보기',close:'닫기',closeLabel:'공지 닫기',week:'일주일 동안 안 보기'},
 en:{hourNote:"Hourly passenger comparison is available for the whole airport only.",countryNote:"* Official departing passenger counts by route country for the latest published month.",hour:'Hourly passenger comparison',hourBody:'Compare today’s forecast with the recent monthly average to see the busier hours.',hourPath:'Airport → Hourly comparison',hourLink:'View hourly comparison',country:'Departing passengers by route country',countryBody:'See month-to-month passenger changes with country flags.',countryPath:'Airport → Passengers by route country',countryLink:'View passengers by country',close:'Close',closeLabel:'Close update notice',week:'Hide for one week'},
 zh:{hourNote:"分时段旅客比较仅支持全机场范围。",countryNote:"* 最近公布月份的官方航线国家出发旅客人数。",hour:'分时段旅客比较',hourBody:'比较今日预测与最近月平均，轻松查看繁忙时段。',hourPath:'机场 → 分时段比较',hourLink:'查看分时段比较',country:'按航线国家统计的出发旅客',countryBody:'结合国旗查看各国旅客相较上月的变化。',countryPath:'机场 → 各航线国家出发旅客',countryLink:'查看各国旅客',close:'关闭',closeLabel:'关闭更新公告',week:'一周内不再显示'},
 ja:{hourNote:"時間帯別の旅客比較は空港全体のみでご覧いただけます。",countryNote:"* 直近の公表月における路線国別の公式出発旅客数です。",hour:'時間帯別の旅客比較',hourBody:'今日の予測と直近の月平均を比べ、混み合う時間帯を確認できます。',hourPath:'空港 → 時間帯別比較',hourLink:'時間帯別比較を見る',country:'路線の国別の出発旅客',countryBody:'国旗とともに旅客の前月からの変化を確認できます。',countryPath:'空港 → 路線の国別の出発旅客',countryLink:'国別の旅客を見る',close:'閉じる',closeLabel:'更新のお知らせを閉じる',week:'1週間表示しない'},
} as const;

export default function UpdateNotice({lang}:{lang:string}){
 const preview=usePathname()?.endsWith('/airport-focus-preview')??false;
 const releaseItems=[
  {title:'공항한눈에는 그대로',body:'오늘의 예상 인원·출발편·대기와 앞으로 1·3·6시간의 흐름을 먼저 확인하세요.',path:'한눈에 → 공항한눈에',view:'home',link:'오늘 공항 확인'},
  {title:'두 기간의 항공편 비교',body:'시간대·요일·터미널·연휴를 두 기간으로 비교하세요. 하루 평균과 실제 포함일수를 표시하며 오늘과 지정 날짜도 비교할 수 있습니다.',path:'한눈에 → 언제 몰렸나요?',view:'rhythm',link:'기간 비교 보기'},
  {title:'국가별 여객과 항공편',body:'공식 월 출국 여객, 항공편 비교, 터미널·구역별 목적지 항공편을 구분해 확인하세요.',path:'국가별 흐름 → 국가별 항공편',view:'flights',link:'국가별 항공편 보기'},
  {title:'처음이라면 더보기',body:'판매사원·영업관리자·고객 안내 직원의 활용 방법과 + 신장, △ 역신장 표시를 짧게 정리했습니다.',path:'더보기 → 누가, 어떻게 쓰면 좋을까요?',view:'more',link:'이용 방법 보기'},
 ];
 const previewItems=[{title:'공항 한눈에',body:'주목할 공항 흐름에서 핵심 지표와 시간·터미널, 노선·휴일 준비, 품목별 기준을 함께 확인하세요.',path:'공항 한눈에 → 오늘 수치·준비 일정',view:'home',link:'공항 한눈에 보기'},{title:'국가별 흐름',body:'국가별 전월 비교와 최근 6개월 추이를 한곳에서 확인하세요.',path:'국가별 흐름 → 월 비교·6개월 추이',view:'countries',link:'국가별 흐름 보기'},{title:'미리 준비',body:'오늘·다음 주·다음 달의 주요 휴일과 휴일 종료 후 출발편 확인 시점을 안내해요. 일본·미국 공휴일은 자동 확인 대상이며, 그 외 일정은 검토 자료입니다.',path:'미리 준비 → 국가별 주요 휴일',view:'prepare',link:'주요 휴일 보기'},{title:'도착국 면세 안내',body:'패션·명품, 화장품·향수, 주류·담배 기준을 구분해 확인하세요. 공식 출처와 확인 상태를 함께 표시해요. 자동 수치 갱신 대상은 일본 일부 항목이며, 나머지는 검토가 필요해요.',path:'미리 준비 → 도착국 반입 면세한도',view:'prepare&section=arrival#arrival-allowances',link:'반입 면세한도 보기'}];
 const locale=lang.startsWith('zh')?'zh':lang==='en'?'en':lang==='ja'?'ja':'ko',c=copy[locale];
 const focusNotice=preview||locale==='ko';
 const focusHref=(view:string)=>view==='rhythm'?'/ko?insight=rhythm':view==='flights'?'/ko/airport-countries?mode=flights':view==='more'?'/ko/more#site-usage-title':preview?`/${locale}/airport-focus-preview?view=${view}`:view==='home'?`/${locale}`:view==='countries'?`/${locale}/airport-countries`:view.includes('section=arrival')?`/${locale}/airport-prepare#arrival-allowances`:`/${locale}/airport-prepare`;
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
  <h2 data-heading="section" id="update-notice-title" tabIndex={-1}><span className="heading-marker" aria-hidden="true"/>{UPDATE_NOTICE_TITLE}</h2>{focusNotice&&<small className="update-notice-date">업데이트 기준 <time dateTime="2026-10-28">2026년 10월 28일</time></small>}
  <div className="update-notice-items">
   {focusNotice&&<ReferenceChangeNotices dialog={dialog} calendarHref={focusHref('prepare')} allowanceHref={focusHref('prepare&section=arrival#arrival-allowances')} onNavigate={()=>dismiss.current(false)}/>}
   {focusNotice?(preview?previewItems:releaseItems).map(item=><section key={item.view}><div><h3>{item.title}</h3><p>{item.body}</p><small>{item.path}</small></div><a href={focusHref(item.view)} onClick={()=>dismiss.current(false)}>{item.link} →</a></section>):<>
   <section><div><h3>{c.hour}</h3><p>{c.hourBody}</p><small>{c.hourPath}</small><p className="update-notice-note">{c.hourNote}</p></div><a href={`/${locale}/airport?terminal=all#airport-hourly-comparison`} onClick={()=>dismiss.current(false)}>{c.hourLink} →</a></section>
   <section><div><h3>{c.country} <span aria-hidden="true">*</span></h3><p>{c.countryBody}</p><small>{c.countryPath}</small><p className="update-notice-note">{c.countryNote}</p></div><a href={`/${locale}/airport-countries#airport-route-passengers`} onClick={()=>dismiss.current(false)}>{c.countryLink} →</a></section>
  </>}
  </div>
  <footer><button type="button" className="update-notice-week" onClick={()=>dismiss.current(true)}>{c.week}</button><button type="button" className="update-notice-close" onClick={()=>dismiss.current(false)}>{c.close}</button></footer>
 </dialog>;
}

