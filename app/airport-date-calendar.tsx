'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import type {Lang} from './retailpulse-data';
import {isValidKstDay,shiftKstDay} from '../lib/kst';

const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const text={
 ko:{pick:'날짜 선택',close:'닫기',prev:'이전 달',next:'다음 달',month:'조회 월',held:'보유 자료 있음',note:'점은 보유 자료가 확인된 날짜입니다. 다른 날짜도 선택할 수 있습니다.',unknown:'보유 날짜 확인 중',failed:'보유 날짜를 확인할 수 없습니다.',today:'오늘'},
 en:{pick:'Select date',close:'Close',prev:'Previous month',next:'Next month',month:'Month to read',held:'Stored data available',note:'Dots mark dates with confirmed stored data. Other dates can also be selected.',unknown:'Checking stored dates',failed:'Stored dates could not be checked.',today:'Today'},
 zh:{pick:'选择日期',close:'关闭',prev:'上个月',next:'下个月',month:'查询月份',held:'有保存资料',note:'圆点表示已确认保存资料的日期。也可选择其他日期。',unknown:'正在确认保存日期',failed:'无法确认保存日期。',today:'今天'},
 ja:{pick:'日付を選択',close:'閉じる',prev:'前の月',next:'次の月',month:'表示月',held:'保存資料あり',note:'点は保存資料が確認された日付です。他の日付も選べます。',unknown:'保存日付を確認中',failed:'保存日付を確認できません。',today:'今日'},
};
export function AirportDateCalendar({lang,selected,today,onChange,known,onMonth,availabilityState}:{lang:Lang;selected:string;today:string;onChange:(date:string)=>void;known:readonly string[];onMonth:(month:string|null)=>void;availabilityState:'READY'|'LOADING'|'FAILED'}) {
 const [open,setOpen]=useState(false),[month,setMonth]=useState(selected.slice(0,7));
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),pending=useRef<string|null>(null);const id=useId(),historyKey=`date-calendar-${id}`;const c=text[lang];
 const latest=useRef({onChange,onMonth});useEffect(()=>{latest.current={onChange,onMonth};},[onChange,onMonth]);
 const selectedDay=new Date(`${selected}T12:00:00+09:00`);
 const formatted=new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}).format(selectedDay)+` (${new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',weekday:'short'}).format(selectedDay)})`;
 function openPicker(){setMonth(selected.slice(0,7));onMonth(selected.slice(0,7));pending.current=null;history.pushState({...history.state,koretailDateCalendar:historyKey},'',location.href);setOpen(true);}
 function closePicker(value?:string){pending.current=value??null;if(history.state?.koretailDateCalendar===historyKey)history.back();else finishClose();}
 function finishClose(){dialog.current?.close();setOpen(false);latest.current.onMonth(null);trigger.current?.focus();const next=pending.current;pending.current=null;if(next)latest.current.onChange(next);}
 useEffect(()=>{
  if(!open)return;
  const node=dialog.current!;node.showModal();
  const rect=trigger.current!.getBoundingClientRect();node.style.setProperty('--calendar-top',`${Math.min(rect.bottom+8,Math.max(12,innerHeight-580))}px`);node.style.setProperty('--calendar-left',`${Math.max(12,Math.min(rect.left,innerWidth-400))}px`);
  node.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus();
  const back=()=>finishClose();window.addEventListener('popstate',back);
  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{window.removeEventListener('popstate',back);document.body.style.overflow=previousOverflow;};
  // The modal lifecycle intentionally uses the values captured when opened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open]);
 const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
 const first=new Date(`${month}-01T12:00:00Z`),offset=first.getUTCDay();
 const count=new Date(Date.UTC(year,m,0)).getUTCDate();
 const dates=Array.from({length:count},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
 const weekdays=Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(locales[lang],{timeZone:'UTC',weekday:'narrow'}).format(new Date(Date.UTC(2026,0,4+i))));
 function changeMonth(next:string){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(next)&&next>='0001-01'&&next<='9999-12'){setMonth(next);onMonth(next);}}
 function monthShift(delta:number){const next=new Date(`${month}-15T12:00:00Z`);next.setUTCMonth(next.getUTCMonth()+delta);changeMonth(next.toISOString().slice(0,7));}
 function moveDay(event:KeyboardEvent<HTMLButtonElement>,date:string){const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(delta===undefined)return;event.preventDefault();const next=shiftKstDay(date,delta);if(!isValidKstDay(next)||next<'0001-01-01'||next>'9999-12-31')return;if(next.slice(0,7)!==month)changeMonth(next.slice(0,7));requestAnimationFrame(()=>dialog.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());}
 return <div className="date-nav-picker date-calendar">
  <button type="button" ref={trigger} className="date-calendar-trigger" data-testid="date-calendar-trigger" data-date={selected} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={openPicker}>
   <img src="/calendar/calendar-32px-1x.webp" srcSet="/calendar/calendar-32px-1x.webp 1x, /calendar/calendar-32px-2x.webp 2x, /calendar/calendar-32px-3x.webp 3x" alt="" width="32" height="32"/><span><small>{c.pick}</small><time dateTime={selected}>{formatted}</time></span><span className="date-calendar-chevron" aria-hidden="true"/>
  </button>
  {open&&<dialog ref={dialog} id={id} className="date-calendar-dialog" aria-label={c.pick} data-testid="date-calendar-dialog" onCancel={event=>{event.preventDefault();closePicker();}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePicker();}}}>
   <div className="date-calendar-handle" aria-hidden="true"/>
   <header><h3>{c.pick}</h3><button type="button" className="date-calendar-close" aria-label={c.close} onClick={()=>closePicker()}>×</button></header>
   <div className="date-calendar-month"><button type="button" aria-label={c.prev} disabled={month==='0001-01'} onClick={()=>monthShift(-1)}>‹</button><label>{c.month}<input type="month" value={month} onChange={event=>changeMonth(event.target.value)}/></label><button type="button" aria-label={c.next} disabled={month==='9999-12'} onClick={()=>monthShift(1)}>›</button></div>
   <div className="date-calendar-weekdays" aria-hidden="true">{weekdays.map((day,i)=><span key={i}>{day}</span>)}</div>
   <div className="date-calendar-days" role="group" aria-label={month}>
    {Array.from({length:offset},(_,i)=><span key={`empty-${i}`}/>)}
    {dates.map(date=><button type="button" key={date} data-date={date} className={date===selected?'selected':''} aria-pressed={date===selected} aria-current={date===today?'date':undefined} aria-label={`${date}${known.includes(date)?` · ${c.held}`:''}`} onKeyDown={event=>moveDay(event,date)} onClick={()=>closePicker(date)}>{Number(date.slice(8))}<span className="date-calendar-dot" data-held={known.includes(date)} aria-hidden="true"/></button>)}
   </div>
   <p className="date-calendar-note" role="status">{availabilityState==='LOADING'?c.unknown:availabilityState==='FAILED'?c.failed:c.note}</p>
   <button type="button" className="date-calendar-today" onClick={()=>closePicker(today)}>{c.today}</button>
  </dialog>}
 </div>;
}
