import {createPeriodTranslator} from './i18n.mjs';
import {mount} from './ui.mjs';
const lang=new URLSearchParams(location.search).get('lang')==='en'?'en':document.documentElement.lang==='zh-CN'?'zh':document.documentElement.lang==='en'?'en':'ko',t=createPeriodTranslator(lang);
// English reuses the existing same-origin frame endpoint and its unchanged CSP.
if(lang==='en'){
 document.documentElement.lang='en';document.title=t(document.title);
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(node.parentElement?.closest('script,style'))continue;
  const value=node.textContent,trimmed=value.trim(),translated=t(trimmed);
  if(translated!==trimmed)node.textContent=value.replace(trimmed,translated);
 }
 for(const element of document.querySelectorAll('[aria-label],[title]'))for(const attribute of ['aria-label','title'])if(element.hasAttribute(attribute))element.setAttribute(attribute,t(element.getAttribute(attribute)));
}
async function loadHistory(day){
 const response=await fetch('/api/live/airport-days?date='+encodeURIComponent(day),{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('unavailable');const data=await response.json();
 if(data.mode!=='airport-days'||data.date!==day||!Array.isArray(data.history))throw Error('invalid');
 return data.history;
}
async function loadToday(day){
 const response=await fetch('/api/live/flights?date='+encodeURIComponent(day),{signal:AbortSignal.timeout(15000),cache:'no-cache'});
 if(!response.ok)throw Error('unavailable');
 const payload=await response.json();
 if(payload.mode!=='live-flights'||payload.serviceDateKst!==day||payload.truncated!==false||!Number.isFinite(Date.parse(payload.retrievedAt))||!['OFFICIAL_DEPARTURE_SCHEDULE','COLLECTED_FLIGHT_RECORDS'].includes(payload.basis)||!Array.isArray(payload.flights)||!payload.flights.length)throw Error('incomplete');
 const chunk=__AIRPORT_TODAY_CHUNK__;
 const {buildTodayProfile}=await import(chunk);
 return buildTodayProfile(payload,day);
}
const main=document.querySelector('main'),status=document.getElementById('load-state');
async function load(){
 const requested=new URLSearchParams(location.search).get('date');
 const day=requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)?requested:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 status.textContent=t('공항 기록을 불러오는 중…');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/live/airport-days?date='+encodeURIComponent(day),{signal:controller.signal});
  if(!response.ok)throw Error('Unavailable');const data=await response.json();
  if(data.mode!=='airport-days'||!Array.isArray(data.history)||data.date!==day)throw Error('Invalid record');
  let calendar=null;
  // A calendar failure must not hide flight records or masquerade as no holidays.
  try{const reply=await fetch('/api/airport/calendar',{signal:AbortSignal.timeout(10000)});if(reply.ok){const value=await reply.json();if(Array.isArray(value.events))calendar=value;}}catch{}
  const calendarAsOf=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  main.hidden=false;
  mount({calendar,calendarAsOf,date:day,history:data.history,countryDays:Array.isArray(data.countryDays)?data.countryDays:[],countryDaysByTerminal:data.countryDaysByTerminal??{},loadToday,loadHistory},lang);status.remove();
 }catch{
  status.textContent=t('공항 기록을 불러오지 못했습니다 ');
  const retry=document.createElement('button');retry.textContent=t('다시 불러오기');retry.onclick=load;status.append(retry);
 }finally{clearTimeout(timer);}
}
void load();
