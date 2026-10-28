import {mount} from './ui.mjs';
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
 status.textContent='공항 기록을 불러오는 중…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/live/airport-days?date='+encodeURIComponent(day),{signal:controller.signal});
  if(!response.ok)throw Error('Unavailable');const data=await response.json();
  if(data.mode!=='airport-days'||!Array.isArray(data.history)||data.date!==day)throw Error('Invalid record');
  main.hidden=false;
  mount({date:day,history:data.history,countryDays:Array.isArray(data.countryDays)?data.countryDays:[],loadToday,loadHistory});status.remove();
 }catch{
  status.textContent='공항 기록을 불러오지 못했습니다 ';
  const retry=document.createElement('button');retry.textContent='다시 불러오기';retry.onclick=load;status.append(retry);
 }finally{clearTimeout(timer);}
}
void load();
