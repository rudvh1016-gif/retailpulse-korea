import {createPeriodTranslator,localizeHolidayName} from './i18n.mjs';
import {shift,normalize,hourlyShares,peakWindow,validateRanges,compareRanges,compareWeekdayRanges,compareCountryRanges,rankCountryRanges} from './analysis.mjs';
import {periodCalendar,holidaySuggestions} from './calendar.mjs';
export function mount(snapshot,lang='ko'){
const t=createPeriodTranslator(lang);
// Chart geometry uses unrounded measurements; only visible labels are rounded.
function chartScale(values){
 const highest=Math.max(1,...values.filter(Number.isFinite)),power=10**Math.floor(Math.log10(highest/5));
 const step=Math.max(1,[1,2,5,10].map(v=>v*power).find(v=>v>=highest/5)||power*10);
 const max=Math.ceil(highest/step)*step;
 return {max,step};
}
function hourlyStacks(m){
 if(m.current.stacks)return m.current.stacks;
 const dates=new Set(m.current.dates),rows=records.filter(r=>dates.has(r.date));
 return m.current.stacks=['h1','h2'].map(key=>Array.from({length:24},(_,h)=>rows.reduce((total,row)=>total+row[key][h],0)/rows.length));
}
function lineChart(m){
 if(state.separate)return separateHourChart(m);
 const share=state.measure==='share',a=share?hourlyShares(m.previous.hours):m.previous.hours,b=share?hourlyShares(m.current.hours):m.current.hours;
 const W=Math.max(300,$('chart').clientWidth||960),small=W<600,H=small?275:310,L=38,R=20,T=34,B=40,pw=W-L-R,ph=H-T-B;
 const scale=chartScale([...(a||[]),...(b||[])]),x=h=>L+(h+.5)/24*pw,y=v=>T+ph-v/scale.max*ph;
 const path=values=>values?values.map((v,h)=>(h?'L':'M')+x(h).toFixed(2)+','+y(v).toFixed(2)).join(' '):'';
 const peak=peakWindow(m.current.hours,state.peak),step=pw/24,bw=step*.68;
 let svg='<svg class="hour-chart" viewBox="0 0 '+W+' '+H+t('" role="group" aria-label="시간별 비교 기간 막대, 기준 회색 점선, 비교 남색 실선">');
 svg+='<text class="axis-unit" x="'+L+'" y="15">'+(share?'%':t('편/일'))+'</text>';
 if(peak)svg+='<rect class="peak-shade" x="'+(L+peak.start*step)+'" y="'+T+'" width="'+state.peak*step+'" height="'+ph+'"/><text class="peak-label" x="'+(L+peak.start*step)+t('" y="22">집중 ')+state.peak+t('시간</text>');
 for(let v=0;v<=scale.max;v+=scale.step)svg+='<line class="gridline" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="axis" x="'+(L-9)+'" y="'+(y(v)+4)+'" text-anchor="end">'+n(v)+'</text>';
 if(b){
  const stacks=state.scope==='ALL'?hourlyStacks(m):null;
  for(let h=0;h<24;h++){
   const first=stacks?(share?stacks[0][h]/m.current.total*100:stacks[0][h]):b[h];
   svg+='<rect class="hour-bar t1" x="'+(x(h)-bw/2)+'" y="'+y(first)+'" width="'+bw+'" height="'+(y(0)-y(first))+'" rx="1"/>';
   if(stacks)svg+='<rect class="hour-bar t2" x="'+(x(h)-bw/2)+'" y="'+y(b[h])+'" width="'+bw+'" height="'+(y(first)-y(b[h]))+'" rx="1"/>';
  }
 }
 // Draw the gray dashed stroke last with a white dashed casing. Even identical
 // values expose gray dashes and black gaps on the same truthful coordinates.
 if(b)svg+='<path class="series current" d="'+path(b)+'"/>';
 if(a)svg+='<path class="series-casing" aria-hidden="true" d="'+path(a)+'"/><path class="series before" d="'+path(a)+'"/>';
 const ticks=small?[0,6,12,18,24]:[0,3,6,9,12,15,18,21,24];
 for(const h of ticks)svg+='<text class="axis time-axis" x="'+(L+h/24*pw)+'" y="'+(H-12)+'" text-anchor="middle">'+String(h).padStart(2,'0')+t('시</text>');
 for(let h=0;h<24;h++)svg+='<rect role="button" class="hour-hit" data-hour="'+h+'" aria-label="'+h+t('시 기준 ')+n(a?.[h])+t(' 비교 ')+n(b?.[h])+' '+(share?t('퍼센트'):t('편/일'))+'" x="'+(L+h*step)+'" y="'+T+'" width="'+step+'" height="'+ph+'"/>';
 svg+=t('</svg><p class="chart-help">시간대를 누르면 두 기간의 수치 확인</p>');
 $('chart').innerHTML=svg;
 $('chart').querySelectorAll('[data-hour]').forEach(el=>{el.onclick=()=>{state.hour=+el.dataset.hour;showHour(m);};el.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();state.hour=(state.hour+(e.key==='ArrowLeft'?23:1))%24;showHour(m);$('chart').querySelector('[data-hour="'+state.hour+'"]').focus();}};});
 showHour(m);
}
function separateHourChart(m){
 const share=state.measure==='share',values=[m.previous,m.current].map(p=>share?hourlyShares(p.hours):p.hours),labels=rangeLabels();
 const W=Math.max(300,$('chart').clientWidth||960),H=W<600?210:195,L=38,R=20,T=18,B=35,pw=W-L-R,ph=H-T-B,scale=chartScale(values.flat().filter(Number.isFinite)),step=pw/24,bw=step*.68,x=h=>L+(h+.5)*step,y=v=>T+ph-v/scale.max*ph;
 $('chart').innerHTML=values.map((array,i)=>{
  let svg='<section class="separated-period"><h5>'+(i?t('비교 '):t('기준 '))+labels[i]+'<span>'+(share?'%':t('편/일'))+'</span></h5><svg class="hour-chart" viewBox="0 0 '+W+' '+H+'" role="group" aria-label="'+(i?t('비교'):t('기준'))+t(' 기간 시간별 출발편">');
  for(let v=0;v<=scale.max;v+=scale.step)svg+='<line class="gridline" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="axis" x="'+(L-8)+'" y="'+(y(v)+4)+'" text-anchor="end">'+n(v)+'</text>';
  if(array){
   const stacks=i&&state.scope==='ALL'?hourlyStacks(m):null;
   array.forEach((v,h)=>{const first=stacks?(share?stacks[0][h]/m.current.total*100:stacks[0][h]):v;
    svg+='<rect class="hour-bar t1" x="'+(x(h)-bw/2)+'" y="'+y(first)+'" width="'+bw+'" height="'+(y(0)-y(first))+'"/>';
    if(stacks)svg+='<rect class="hour-bar t2" x="'+(x(h)-bw/2)+'" y="'+y(v)+'" width="'+bw+'" height="'+(y(first)-y(v))+'"/>';
   });
   svg+='<path class="series '+(i?'current':'before')+'" d="'+array.map((v,h)=>(h?'L':'M')+x(h)+','+y(v)).join(' ')+'"/>';
  }
  for(const h of [0,6,12,18,24])svg+='<text class="axis time-axis" x="'+(L+h*step)+'" y="'+(H-8)+'" text-anchor="middle">'+String(h).padStart(2,'0')+t('시</text>');
  for(let h=0;h<24;h++)svg+='<rect class="hour-hit" role="button" data-hour="'+h+'" aria-label="'+h+t('시 두 기간 비교" x="')+(L+h*step)+'" y="'+T+'" width="'+step+'" height="'+ph+'"/>';
  return svg+'</svg></section>';
 }).join('')+t('<p class="chart-help">위·아래 같은 눈금 · 시간대를 누르면 두 기간 수치 확인</p>');
 $('chart').querySelectorAll('[data-hour]').forEach(el=>{el.onclick=()=>{state.hour=+el.dataset.hour;showHour(m);};el.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();state.hour=+el.dataset.hour;showHour(m);}};});showHour(m);
}
function weekdayChart(m){
 const a=m.weekdays.previous,b=m.weekdays.current,W=Math.max(300,$('chart').clientWidth||960),small=W<600,H=small?335:350,L=small?30:42,R=8,T=36,B=88,pw=W-L-R,ph=H-T-B,cw=pw/7;
 const scale=chartScale([...a.bins,...b.bins].map(d=>d.mean)),y=v=>T+ph-v/scale.max*ph,bw=Math.min(small?13:32,cw*.24),gap=small?3:7;
 let svg='<svg class="weekday-chart" viewBox="0 0 '+W+' '+H+t('" role="group" aria-label="월요일부터 일요일까지 기준과 비교 기간의 하루 평균 출발편">');
 svg+='<text class="axis-unit" x="'+L+t('" y="15">편/일</text><rect class="weekend-shade" x="')+(L+5*cw)+'" y="'+T+'" width="'+2*cw+'" height="'+ph+'"/>';
 for(let v=0;v<=scale.max;v+=scale.step)svg+='<line class="gridline" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="axis" x="'+(L-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+n(v)+'</text>';
 b.bins.forEach((row,i)=>{
  const old=a.bins[i],cx=L+(i+.5)*cw,deltaValue=old.mean===null||row.mean===null?null:row.mean-old.mean;
  svg+='<g class="weekday-pair">';
  [old.mean,row.mean].forEach((v,j)=>{if(v!==null){const bx=cx+(j?gap/2:-gap/2-bw);svg+='<rect class="column-bar '+(j?'current':'before')+'" x="'+bx+'" y="'+y(v)+'" width="'+bw+'" height="'+(y(0)-y(v))+'" rx="2"/>';if(!small)svg+='<text class="column-value '+(j?'':'before')+'" x="'+(bx+bw/2)+'" y="'+(y(v)-10)+'" text-anchor="middle">'+n(v)+'</text>';}});
  if(small)svg+='<text class="column-value" x="'+cx+'" y="'+(Math.min(y(old.mean||0),y(row.mean||0))-11)+'" text-anchor="middle">'+n(row.mean)+'</text>';
  svg+='<text class="weekday-name" x="'+cx+'" y="'+(H-B+25)+'" text-anchor="middle">'+weekNames[i]+'</text><text class="weekday-samples" x="'+cx+'" y="'+(H-B+43)+'" text-anchor="middle">'+old.n+t('일 / ')+row.n+t('일</text><text class="weekday-change ')+cls(deltaValue)+'" x="'+cx+'" y="'+(H-B+66)+'" text-anchor="middle">'+signed(deltaValue)+'</text>';
  svg+='<rect role="button" class="weekday-hit" data-weekday="'+i+'" tabindex="0" aria-label="'+weekNames[i]+t('요일 기준 ')+n(old.mean)+t(' 비교 ')+n(row.mean)+t('편/일" x="')+(L+i*cw)+'" y="'+T+'" width="'+cw+'" height="'+(H-T)+'"/></g>';
 });
 $('chart').innerHTML=svg+'</svg><p class="chart-help">'+(small?t('막대 위 숫자: 비교 기간 · '):'')+t('포함일: 기준 / 비교 · 요일을 누르면 상세 수치</p>');
 const select=i=>{const p=a.bins[i],q=b.bins[i];$('selection').innerHTML='<strong>'+weekNames[i]+t('요일</strong><span>기준 <b>')+n(p.mean)+t('</b>편/일 · ')+p.n+t('일</span><span>비교 <b>')+n(q.mean)+t('</b>편/일 · ')+q.n+t('일</span>');};
 $('chart').querySelectorAll('[data-weekday]').forEach(el=>{el.onclick=()=>select(+el.dataset.weekday);el.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select(+el.dataset.weekday);}};});
}
function holidayChart(m){
 const values=[m.previous.total,m.current.total],labels=rangeLabels(),W=Math.min(560,Math.max(300,$('chart').clientWidth||560)),H=270,L=44,R=12,T=35,B=58,pw=W-L-R,ph=H-T-B,scale=chartScale(values),y=v=>T+ph-v/scale.max*ph,bw=Math.min(82,pw*.22);
 let svg='<svg class="holiday-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+countryName(state.country)+t('행 기준 ')+n(values[0])+t(' 비교 ')+n(values[1])+t('편/일">');
 svg+='<text class="axis-unit" x="'+L+t('" y="15">편/일</text>');
 for(let v=0;v<=scale.max;v+=scale.step)svg+='<line class="gridline" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="axis" x="'+(L-9)+'" y="'+(y(v)+4)+'" text-anchor="end">'+n(v)+'</text>';
 values.forEach((v,i)=>{const cx=L+pw*(i?.73:.27);svg+='<rect class="column-bar '+(i?'current':'before')+'" x="'+(cx-bw/2)+'" y="'+y(v)+'" width="'+bw+'" height="'+(y(0)-y(v))+'" rx="3"/><text class="holiday-value" x="'+cx+'" y="'+(y(v)-12)+'" text-anchor="middle">'+n(v)+t('편</text><text class="weekday-name" x="')+cx+'" y="'+(H-31)+'" text-anchor="middle">'+(i?t('비교'):t('기준'))+'</text><text class="holiday-date" x="'+cx+'" y="'+(H-10)+'" text-anchor="middle">'+labels[i]+'</text>';});
 $('chart').innerHTML=svg+'</svg>';
}

const cleaned=normalize(snapshot),records=cleaned.days;
const terminalEvents={asiana:{name:t('아시아나'),date:'2026-01-14',url:'https://m.flyasiana.com/C/KR/KO/customer/notice/detail?id=CM202509300002526502'},airseoul:{name:t('에어서울'),date:'2025-09-09',url:'https://pkg.ybtour.co.kr/cs/noticeView.yb?noticeNo=20000017544'},airbusan:{name:t('에어부산'),date:'2025-07-29',url:'https://airinfo.airport.kr/co_ko/664/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGY29fa28lMkY4NCUyRjEzODc2NSUyRmFydGNsVmlldy5kbyUzRg%3D%3D'}};
const $=id=>document.getElementById(id),views=['rhythm','weekday','terminal','holiday','country'];
const latest=records.at(-1)?.date||snapshot.date,month=latest.slice(0,7),previousMonth=shift(month+'-01',-1).slice(0,7);
const initial={aStart:previousMonth+'-01',aEnd:shift(month+'-01',-1),bStart:month+'-01',bEnd:latest};
const recent=weeks=>({aStart:shift(latest,1-weeks*14),aEnd:shift(latest,-weeks*7),bStart:shift(latest,1-weeks*7),bEnd:latest});
const state={view:'rhythm',separate:false,scope:'ALL',measure:'count',peak:3,hour:8,country:'JP',sort:'delta',ranges:{rhythm:{...initial},weekday:recent(4),terminal:{...initial},holiday:{aStart:'2026-09-14',aEnd:'2026-09-16',bStart:'2026-09-21',bEnd:'2026-09-23'},country:{...initial}}};
const integerFormat=new Intl.NumberFormat(lang==='zh'?'zh-CN':lang==='en'?'en-US':'ko-KR',{maximumFractionDigits:0});
const roundDisplay=v=>Math.sign(v)*Math.floor(Math.abs(v)+0.5);
const n=v=>v===null||!Number.isFinite(v)?'—':integerFormat.format(roundDisplay(v));
const signed=(v,unit='')=>{if(v===null||!Number.isFinite(v))return '—';const value=roundDisplay(v);return (value>0?'+':value<0?'△':'')+n(Math.abs(value))+unit;};
const cls=v=>v>0?'increase':v<0?'decrease':'neutral';
const date=s=>s?s.slice(5).replace('-','/'):'';
const range=(a,b)=>date(a)+' ~ '+date(b),rangeLabels=()=>{const r=state.ranges[state.view];return [range(r.aStart,r.aEnd),range(r.bStart,r.bEnd)];};
const names={ALL:t('공항 전체'),T1:t('T1·탑승동'),T2:'T2'},weekNames=lang==='zh'?['周一','周二','周三','周四','周五','周六','周日']:lang==='en'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['월','화','수','목','금','토','일'];
const regionNames=new Intl.DisplayNames([lang],{type:'region'}),countryName=c=>regionNames.of(c)||c;
const countries=[...new Set((snapshot.countryDays||[]).map(r=>r.country))].sort((a,b)=>countryName(a).localeCompare(countryName(b),lang));
const suggestions=holidaySuggestions(snapshot.calendar,snapshot.countryDays||[],snapshot.calendarAsOf);
const suggestionBox=$('holiday-suggestions');suggestionBox.replaceChildren();
const suggestionLabel=document.createElement('span');suggestionLabel.textContent=t('연휴 추천');suggestionBox.append(suggestionLabel);
for(const [index,h] of suggestions.entries()){
 const button=document.createElement('button');button.dataset.holiday=h.country;button.dataset.suggestion=String(index);
 button.textContent=countryName(h.country)+' '+range(h.start,h.end)+' · '+[...new Set(h.names)].map(name=>localizeHolidayName(lang,name)).join('·');
 button.onclick=()=>{state.country=h.country;state.ranges.holiday={aStart:h.beforeStart,aEnd:h.beforeEnd,bStart:h.start,bEnd:h.end};render();};suggestionBox.append(button);
}
const suggestionNote=document.createElement('small');suggestionNote.textContent=suggestions.length?t('달력·미리 준비와 같은 공식 일정 · 기준 기간 휴일 가능'):t('연휴 추천 미확인 · 날짜 직접 선택');suggestionBox.append(suggestionNote);
const table=(heads,rows)=>'<div class="data-table-wrap"><table class="data-table"><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((v,i)=>i?'<td>'+v+'</td>':'<th scope="row">'+v+'</th>').join('')+'</tr>').join('')+'</tbody></table></div>';
function pairedRow(title,sub,a,b,max,unit,change,labels=[t('기준'),t('비교')]){
 const bar=(v,i)=>{const ratio=v===null?0:Math.max(0,Math.min(100,v/max*100));return '<div class="bar-line"><span class="bar-label">'+labels[i]+'</span><div class="bar-scale"><div class="bar-track" aria-hidden="true"><div class="bar-fill '+(i?'current':'before')+'" style="width:'+ratio+'%"></div></div><strong class="bar-number" style="left:'+ratio+'%">'+(v===null?(unit==='%'?t('계산 불가'):t('기록 없음')):n(v,unit==='%'?2:1)+'<small>'+unit+'</small>')+'</strong></div></div>';};
 return '<div class="comparison-row"><div class="row-heading"><h4>'+title+(sub?'<span>'+sub+'</span>':'')+'</h4><strong class="row-change">'+change+'</strong></div>'+bar(a,0)+bar(b,1)+'</div>';
}
function delta(v,unit=t('편/일'),digits=1){return '<span class="'+cls(v)+'">'+(v!==null&&v!==0&&roundDisplay(v)===0?(v>0?'+':'△')+(lang==='zh'?'不足1'+unit:'1'+unit+t(' 미만')):signed(v,unit,digits))+'</span>';}
function bandSummary(b,i){
 const title=[t('새벽'),t('오전'),t('오후'),t('저녁')][i],time=[t('00 ~ 06시'),t('06 ~ 12시'),t('12 ~ 18시'),t('18 ~ 24시')][i];
 const share=v=>Number.isFinite(v)?n(v)+'%':'—';
 return '<article class="band-summary" aria-label="'+title+' '+time+t(' 변화"><header><h5>')+title+'</h5><time>'+time+'</time></header><table aria-label="'+title+t(' 기준과 비교"><colgroup><col/><col/><col/></colgroup><thead><tr><td></td><th scope="col">기준</th><th scope="col">비교</th></tr></thead><tbody><tr><th scope="row">비중</th><td>')+share(b.previousShare)+'</td><td>'+share(b.currentShare)+t('</td></tr><tr><th scope="row">편/일</th><td>')+n(b.previous)+'</td><td>'+n(b.current)+t('</td></tr></tbody></table><div class="band-changes"><div><span class="band-change-label">비중 변화</span>')+delta(b.shareChange,'%p')+t('</div><div><span class="band-change-label">편수 변화</span>')+delta(b.current-b.previous)+'</div></div></article>';
}
function metric(label,value,unit=t('편/일'),digits=1){return '<div><span>'+label+'</span><strong>'+n(value,digits)+'<small>'+unit+'</small></strong></div>';}
function legend(line=false){const labels=rangeLabels();$('legend').innerHTML='<span><i class="'+(line?'line-key before':'swatch before')+t('"></i>기준 ')+labels[0]+'</span><span><i class="'+(line?'line-key':'swatch')+t('"></i>비교 ')+labels[1]+'</span>'+(line?'<span class="bar-key"><i class="swatch stack-one"></i>'+(state.scope==='ALL'?t('비교 막대: T1·탑승동 <i class="swatch stack-two"></i>T2'):t('비교 기간 시간별 편수'))+'</span>':'');}
function bindLineLayout(){if(state.view!=='rhythm')return;const button=document.createElement('button');button.id='separate-lines';button.textContent=state.separate?t('두 선 겹쳐 보기'):t('두 선 나눠 보기');button.setAttribute('aria-pressed',String(!!state.separate));button.onclick=()=>{state.separate=!state.separate;render();};$('legend').append(button);}
function coverage(m){return t('기준 ')+m.coverage.previous.days+'/'+m.coverage.previous.expected+t('일 · 비교 ')+m.coverage.current.days+'/'+m.coverage.current.expected+t('일 포함')+(m.overlap.length?t(' · 겹치는 날짜 ')+m.overlap.length+t('일'):'');}
function method(m){return t('<p>기간 합계 ÷ 포함일 = 일평균 · 시간대 합계 ÷ 전체 = 비중</p><p>기간 길이·요일 구성 다름 · 누락일은 0편 처리 안 함</p><p>정수 반올림 표시 · 계산·차트는 원값</p>')+['previous','current'].map((side,i)=>{const c=m.coverage[side];return '<p><b>'+(i?t('비교'):t('기준'))+' '+range(c.start,c.end)+t('</b> · 포함 ')+c.days+'/'+c.expected+t('일<br>')+c.dates.map(date).join(', ')+(c.missing.length?t('<br>기록 없음: ')+c.missing.map(date).join(', '):'')+'</p>';}).join('');}
const query=new URLSearchParams(location.search);if(views.includes(query.get('view')))state.view=query.get('view');
const requested=Object.fromEntries(['aStart','aEnd','bStart','bEnd'].map(k=>[k,query.get(k)]));if(!validateRanges(requested))state.ranges[state.view]=requested;
if(!records.some(d=>d.date>=state.ranges.holiday.bStart&&d.date<=state.ranges.holiday.bEnd))state.ranges.holiday={...initial};
let activeModel=null;
const modelCache=new Map();
function countryScope(){return state.view==='country'?state.scope:'ALL';}
function countryRows(){const scope=countryScope();return scope==='ALL'?snapshot.countryDays:(snapshot.countryDaysByTerminal?.[scope]??[]);}
function model(){const r=state.ranges[state.view],scope=state.view==='terminal'?'ALL':state.scope,key=JSON.stringify([state.view,scope,state.country,r]);if(modelCache.has(key))return modelCache.get(key);const days=state.view==='rhythm'?records:records.filter(d=>!d.provisional);let m=state.view==='weekday'?compareWeekdayRanges(days,scope,r):['holiday','country'].includes(state.view)?compareCountryRanges(countryRows(),state.country,r,countryScope()):compareRanges(days,scope,r);modelCache.set(key,m);if(modelCache.size>60)modelCache.delete(modelCache.keys().next().value);return m;}
function showHour(m){const h=state.hour,share=state.measure==='share',a=share?hourlyShares(m.previous.hours)?.[h]:m.previous.hours[h],b=share?hourlyShares(m.current.hours)?.[h]:m.current.hours[h];$('selection').innerHTML='<strong>'+String(h).padStart(2,'0')+' ~ '+String(h+1).padStart(2,'0')+t('시</strong><span>기준 ')+n(a,share?2:1)+(share?'%':t('편/일'))+t('</span><span>비교 <b>')+n(b,share?2:1)+(share?'%':t('편/일'))+'</b></span>'+delta(a==null||b==null?null:b-a,share?'%p':t('편/일'),share?2:1);$('chart').querySelectorAll('[data-hour]').forEach(el=>{el.setAttribute('aria-pressed',String(+el.dataset.hour===h));el.tabIndex=+el.dataset.hour===h?0:-1;});}
function rhythm(m){
 const a=peakWindow(m.previous.hours,state.peak),b=peakWindow(m.current.hours,state.peak),bands=m.bands,morning=bands[1],evening=bands[3];
 $('finding-title').textContent=b?String(b.start).padStart(2,'0')+' ~ '+String(b.end).padStart(2,'0')+t('시 · 하루 출발편의 ')+n(b.share*100)+'%':t('비교 기간 0편 · 집중 구간 없음');
 $('finding-subtitle').textContent=a?t('기준 집중 ')+a.start+' ~ '+a.end+t('시 ')+n(a.share*100)+t('% → 비교 ')+(b?b.start+' ~ '+b.end+t('시 ')+n(b.share*100)+'%':t('계산 불가'))+(b&&b.ties>1?t(' · 동점 ')+b.ties+t('개 중 가장 이른 구간'):''):'';
 $('finding-metrics').innerHTML=metric(t('기준 하루 평균'),m.previous.total)+metric(t('비교 하루 평균'),m.current.total);
 $('chart-title').textContent=t('24시간 출발편 ')+(state.measure==='share'?t('비중'):t('일평균'));legend(true);bindLineLayout();lineChart(m);
 $('bands').innerHTML=t('<header class="bands-heading"><h4>시간대별 변화</h4><p>+ 신장 · △ 역신장</p></header>')+bands.map(bandSummary).join('');
 const knownShift=Number.isFinite(morning.shareChange)&&Number.isFinite(evening.shareChange),tinyShift=knownShift&&Math.abs(morning.shareChange)<1&&Math.abs(evening.shareChange)<1;
 $('takeaway').textContent=t('기준 대비 하루 평균 출발편 ')+signed(m.current.total-m.previous.total,t('편'))+' · '+(!knownShift?t('오전·저녁 비중 계산 불가'):tinyShift?t('오전·저녁 비중 변화는 1%p 미만'):t('오전 ')+(morning.shareChange>0?t('비중 증가'):morning.shareChange<0?t('비중 감소'):t('비중 동일'))+t(' · 저녁 ')+(evening.shareChange>0?t('비중 증가'):evening.shareChange<0?t('비중 감소'):t('비중 동일')));
 $('boundary').textContent=t('하루 출발편 중 비중 · 예정시각 기준 · 방문·매출 추정 아님');
 $('method').innerHTML=method(m)+t('<p>집중: 평균 분포에서 최다 연속 ')+state.peak+t('시간 · 매일 같은 시간 아님</p>');
 $('hourly-detail').hidden=false;$('hourly-table').innerHTML=table([t('시각'),t('기준 편/일'),t('비교 편/일'),t('증감')],m.current.hours.map((v,h)=>[h+' ~ '+(h+1)+t('시'),n(m.previous.hours[h]),n(v),signed(v-m.previous.hours[h],t('편/일'))]));
}
function terminal(m){
 const a=m.previous,b=m.current,share=state.measure==='share';
 $('finding-title').textContent=t('T1·탑승동 ')+signed(b.T1-a.T1,t('편/일'))+' · T2 '+signed(b.T2-a.T2,t('편/일'));
 $('finding-subtitle').textContent=t('공항 전체 ')+n(a.total)+' → '+n(b.total)+t('편/일 · ')+signed(m.change,'%');
 $('finding-metrics').innerHTML='';$('chart-title').textContent=share?t('공항 내 비중'):t('터미널별 하루 평균 출발편');legend();
 const max=share?100:Math.max(1,a.T1,a.T2,b.T1,b.T2);
 $('chart').innerHTML=['T1','T2'].map(terminal=>{const p=share?(a.mix[terminal]==null?null:a.mix[terminal]*100):a[terminal],q=share?(b.mix[terminal]==null?null:b.mix[terminal]*100):b[terminal];return pairedRow(names[terminal],share?t('공항 전체 = 100%'):'',p,q,max,share?'%':t('편/일'),delta(p==null||q==null?null:q-p,share?'%p':t('편/일'),share?2:1));}).join('');
 const d1=b.T1-a.T1,d2=b.T2-a.T2;
 $('takeaway').textContent=d1*d2<0?t('두 터미널의 증감 방향이 다름'):d1>0&&d2>0?(Math.abs(d1-d2)<1e-9?t('두 터미널 모두 같은 편수 증가'):t('두 터미널 모두 증가 · ')+(d1>d2?t('T1·탑승동'):'T2')+t(' 증가 편수가 더 많음')):d1<0&&d2<0?t('두 터미널 모두 감소'):t('기준 기간 대비 터미널별 증감');
 $('boundary').textContent=t('T1=본관+탑승동 · 항공사 이전 효과 미검증');$('method').innerHTML=method(m);
}
function weekdays(m){
 const a=m.weekdays.previous,b=m.weekdays.current;
 $('finding-title').textContent=b.change===null?t('평일·주말 비교 자료 부족'):t('비교 기간 주말 ')+signed(b.change,'%')+t(' · 평일 대비');
 $('finding-subtitle').textContent=t('기준 기간 주말 ')+signed(a.change,'%')+t(' · 평일 대비');
 $('finding-metrics').innerHTML=metric(t('비교 기간 평일'),b.weekdayMean)+metric(t('비교 기간 토·일'),b.weekendMean);
 $('chart-title').textContent=t('요일별 하루 평균 출발편');legend(); weekdayChart(m);
 const usable=b.bins.filter(x=>x.mean!==null),high=usable.sort((x,y)=>y.mean-x.mean)[0];
 $('takeaway').textContent=high?t('비교 기간에서 출발편이 가장 많은 요일: ')+weekNames[high.day]+t('요일 · 하루 평균 ')+n(high.mean)+t('편'):t('요일별 자료 없음');
 $('boundary').textContent=high?t('비교 기간에 포함된 ')+weekNames[high.day]+t('요일 ')+high.n+t('일 평균 · 휴일·계절 영향 미분리'):t('요일별 포함일 표시 · 휴일·계절 영향 미분리');
 $('method').innerHTML=method(m)+t('<p>평일·주말별 실제 포함일로 평균 · 적은 표본은 변동 가능</p>');
 $('data-table').innerHTML=table([t('기간'),t('날짜'),t('요일'),t('편수')],['previous','current'].flatMap((side,i)=>m.weekdays[side].bins.flatMap(bin=>bin.rows.map(r=>[i?t('비교'):t('기준'),r.date,weekNames[bin.day],n(r.value,0)]))));
}
function countryList(r,interactive){
 let rows=rankCountryRanges(countryRows(),r,countryScope());if(state.sort==='volume')rows.sort((a,b)=>b.current.total-a.current.total);if(state.sort==='down')rows.sort((a,b)=>a.delta-b.delta);
 const max=Math.max(1,...rows.flatMap(x=>[x.previous.total,x.current.total]));
 return t('<div class="country-sort"><label>보기 순서 <select id="country-sort"><option value="delta">증가 큰 순</option><option value="down">감소 큰 순</option><option value="volume">편수 많은 순</option></select></label><span>')+rows.length+t('개 저장 목적지 · ')+names[countryScope()]+'</span></div><div class="country-pairs">'+rows.map(m=>'<article>'+ (interactive?'<button class="country-pick" data-country="'+m.country+'" aria-pressed="'+(m.country===state.country)+'">'+countryName(m.country)+t('행 보기</button>'):'')+pairedRow(countryFlag(m.country)+countryName(m.country),'',m.previous.total,m.current.total,max,t('편/일'),delta(m.delta)+' <small>'+signed(m.change,'%')+'</small>')+'</article>').join('')+'</div>';
}
function countryFlag(code){if(!countries.includes(code)||!/^[A-Z]{2}$/.test(code))return '';const file=['JP','CN','US','VN'].includes(code)?code+'.webp':'fallback/'+code.toLowerCase()+'.svg';return '<img class="country-flag" src="/images/airport-flags/'+file+'" width="20" height="14" alt="" loading="lazy">';}
function bindCountryList(){const select=$('country-sort');if(select){select.value=state.sort;select.onchange=()=>{state.sort=select.value;render();};}document.querySelectorAll('[data-country]').forEach(b=>b.onclick=()=>{state.country=b.dataset.country;render();});}
function country(m){
 const rows=rankCountryRanges(countryRows(),state.ranges[state.view],countryScope()),top=rows[0],down=[...rows].sort((a,b)=>a.delta-b.delta)[0];
 $('finding-title').textContent=top&&top.delta>0?countryName(top.country)+t('행 ')+signed(top.delta,t('편/일'))+t(' · 가장 큰 증가'):t('국가별 출발편 증감');
 $('finding-subtitle').textContent=down&&down.delta<0?countryName(down.country)+t('행 ')+signed(down.delta,t('편/일'))+t(' · 가장 큰 감소'):'';
 $('finding-metrics').innerHTML='';$('chart-title').textContent=t('국가별 하루 평균 출발편');legend();$('chart').innerHTML=countryList(state.ranges[state.view],false);bindCountryList();
 $('takeaway').textContent=t('기간별 규모와 증감을 함께 비교');$('boundary').textContent=t('저장된 일별 기록 ')+countries.length+t('개 목적지 · ')+names[state.scope]+t(' · 승객 국적 아님');$('method').innerHTML=method(m)+t('<p>T1=본관+탑승동 · 미확인 날짜 제외</p>');
}
function holiday(m){
 const a=m.previous.total,b=m.current.total,r=state.ranges.holiday;
 $('finding-title').textContent=countryName(state.country)+t('행 ')+signed(b-a,t('편/일'))+' · '+signed(m.change,'%');
 $('finding-subtitle').textContent=t('기준 ')+range(r.aStart,r.aEnd)+t(' → 비교 ')+range(r.bStart,r.bEnd);
 $('finding-metrics').innerHTML='';
 $('chart-title').textContent=countryName(state.country)+t('행 하루 평균 출발편');legend();holidayChart(m);
 $('takeaway').textContent=t('포함일수 ')+m.coverage.previous.days+t('일 → ')+m.coverage.current.days+t('일 · 합계 ')+n(m.previous.sum,0)+' → '+n(m.current.sum,0)+t('편');
 $('boundary').textContent=t('관측 차이 · 연휴 효과·매출 예측 아님');
 $('country-context').hidden=false;$('country-rank').innerHTML=countryList(r,true);bindCountryList();
 $('method').innerHTML=method(m)+t('<p>전체 공항 목적지별 출발편 · 승객 국적 아님</p>');
 $('data-table').innerHTML=table([t('기간'),t('날짜'),t('편수')],['previous','current'].flatMap((side,i)=>m[side].rows.map(x=>[i?t('비교'):t('기준'),x.date,n(x.value,0)])));
}
function holidayContext(m){
 const box=$('holiday-calendar-context');box.replaceChildren();box.hidden=state.view!=='holiday';if(box.hidden)return;
 const r=state.ranges.holiday;
 const add=(tag,text,parent=box)=>{const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;};
 add('p',t('회색: 기준 · 파랑: 비교 (휴일 여부와 무관)')).className='holiday-period-key';
 for(const [side,start,end,label] of [['previous',r.aStart,r.aEnd,t('기준 · 회색')],['current',r.bStart,r.bEnd,t('비교 · 파랑')]]){
  const c=periodCalendar(snapshot.calendar,state.country,start,end,snapshot.calendarAsOf),section=document.createElement('section');section.dataset.period=side;box.append(section);
  add('strong',label+' '+start+' ~ '+end,section);
  const cov=m.coverage?.[side];add('p',t('항공편 수집 ')+(cov?cov.days+'/'+cov.expected+t('일'):t('확인 불가')),section);
  add('p',countryName(state.country)+t(' 목적지 휴일 · ')+(c.status==='holiday'?c.holidayDays+t('일 포함'):c.status==='no_holiday'?t('공식 연간 자료에서 공휴일·조정 휴무 없음'):t('자료 미확인 · 휴일 없음으로 판단할 수 없음')),section);
  for(const e of c.events){
   const p=add('p',localizeHolidayName(lang,e.name)+' '+e.start+' ~ '+e.end+' · '+(e.dateKind==='announced_rest_interval'?t('공식 조정 휴무 구간'):t('공휴일'))+t(' · 확인 ')+e.verifiedAt+' ',section);
   const a=add('a',t('공식 출처'),p);a.href=e.sourceURL;a.target='_blank';a.rel='noreferrer';
  }
  if(c.workdays.length)add('p',t('보충근무일 · ')+c.workdays.join(', ')+t(' (휴일 아님)'),section);
  if(c.refreshFailed)add('p',t('달력 갱신 실패·미수집 · 마지막 확인 자료만 표시'),section);
  const origin=periodCalendar(snapshot.calendar,'KR',start,end,snapshot.calendarAsOf);
  if(state.country!=='KR'&&origin.events.length)add('p',t('한국 출발지 참고 · ')+origin.events.map(e=>localizeHolidayName(lang,e.name)+' '+e.start+(e.end!==e.start?' ~ '+e.end:'')).join(', ')+t(' · 목적지 휴일과 별개'),section);
 }
 const incomplete=m.coverage&&(!m.coverage.previous.complete||!m.coverage.current.complete);
 $('context-note').textContent=(incomplete?t('수집일 부족 · '):'')+t('휴일·관측 평균 비교 · 차이 없음·연휴 효과 단정 불가');
}
function syncControls(){
 $('section-intro').hidden=state.view!=='rhythm';
 $('today-preset').hidden=state.view!=='rhythm';
 $('terminal-events').hidden=state.view!=='terminal';
 const view=state.view,r=state.ranges[view],countryView=view==='country'||view==='holiday';
 const todayRow=records.find(d=>d.provisional);
 $('today-compare-control').hidden=!(view==='rhythm'&&todayRow&&r.bStart===todayRow.date&&r.bEnd===todayRow.date);
 $('today-compare-date').value=r.aStart;
 $('section-title').textContent={rhythm:t('언제 몰렸나요?'),weekday:t('항공편 주말이 더 많나요?'),terminal:t('어느 터미널이 달라졌나요?'),holiday:t('연휴에는 늘었나요?'),country:t('국가별 항공편 · 기간 비교')}[view];
 $('scope-controls').hidden=view==='holiday'||view==='terminal';$('scope-controls').dataset.mode=view==='country'?'country':'default';$('scope-controls').setAttribute('aria-label',view==='country'?t('터미널 선택'):t('분석 범위'));$('fixed-scope').hidden=!$('scope-controls').hidden;$('fixed-scope').textContent=countryView?t('공항 전체 · 목적지 국가 기준'):t('공항 전체 · T1·탑승동 / T2');
 $('country-control').hidden=view!=='holiday';$('country-select').value=state.country;$('holiday-suggestions').hidden=view!=='holiday';
 $('peak-control').hidden=view!=='rhythm';$('peak-window').value=state.peak;$('measure-control').hidden=!['rhythm','terminal'].includes(view);
 for(const [id,k] of [['a-start','aStart'],['a-end','aEnd'],['b-start','bStart'],['b-end','bEnd']])$(id).value=r[k];
 document.querySelectorAll('[data-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===state.scope)));
 document.querySelectorAll('[data-measure]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.measure===state.measure)));
 document.querySelectorAll('[data-view]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.view===view));b.tabIndex=b.dataset.view===view?0:-1;});
 document.querySelectorAll('[data-weeks]').forEach(b=>b.setAttribute('aria-pressed',String(JSON.stringify(recent(+b.dataset.weeks))===JSON.stringify(r))));
 $('country-jump').hidden=view==='country';
 const completed=records.filter(d=>!d.provisional);
 $('coverage').textContent=countryView?t('국가별 일별 기록 · ')+names[countryScope()]+' · '+countries.length+t('개 목적지'):t('완료 기록 ')+completed.length+t('일 · 날짜별 포함 여부 확인');
}
function render(){
 const started=performance.now();syncControls();for(const id of ['selection','bands','method','data-table','finding-metrics','finding-subtitle','takeaway','boundary','context-note'])$(id).replaceChildren();$('country-context').hidden=true;$('hourly-detail').hidden=true;$('hourly-detail').open=false;$('evidence').open=false;$('range-error').textContent='';
 activeModel=model();const m=activeModel;$('panel').dataset.view=state.view;
 $('comparison-caption').textContent=t(m.error)||coverage(m);
 const provisional=state.view==='rhythm'&&records.find(d=>d.provisional&&[m.coverage?.previous,m.coverage?.current].some(c=>c?.dates.includes(d.date)));
 if(provisional)$('comparison-caption').textContent+=t(' · 당일 미확정 ')+(provisional.basis==='OFFICIAL_DEPARTURE_SCHEDULE'?t('예정편'):t('수집 기록'))+t(' · 수집 ')+new Intl.DateTimeFormat(lang==='zh'?'zh-CN':lang==='en'?'en-US':'ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(provisional.retrievedAt))+' KST';
 holidayContext(m);
 if(!m.available){$('finding-title').textContent=t('양쪽 기간의 기록이 필요합니다');$('chart-title').textContent=t('비교 자료 부족');$('legend').replaceChildren();$('chart').innerHTML=t('<p class="no-data">기간을 바꾸거나 기록이 있는 날짜를 선택</p>');$('method').innerHTML=t(m.error)||method(m);}
 else({rhythm,weekday:weekdays,terminal,holiday,country})[state.view](m);
 $('chart').classList.remove('motion');if(!matchMedia('(prefers-reduced-motion: reduce)').matches){requestAnimationFrame(()=>$('chart').classList.add('motion'));}
 $('announcement').textContent=$('finding-title').textContent;if(parent!==window)parent.postMessage({type:'koretail-insights-state',view:state.view,ranges:state.ranges[state.view]},location.origin);document.documentElement.dataset.renderMs=(performance.now()-started).toFixed(1);reportHeight();
}
$('range-form').onsubmit=e=>{e.preventDefault();const r={aStart:$('a-start').value,aEnd:$('a-end').value,bStart:$('b-start').value,bEnd:$('b-end').value},error=validateRanges(r);if(error){$('range-error').textContent=t(error);return;}state.ranges[state.view]=r;render();};
$('range-form').oninput=()=>{$('range-error').textContent=t('기간 적용을 누르면 차트에 반영');};
document.querySelectorAll('[data-weeks]').forEach(b=>b.onclick=()=>{state.ranges[state.view]=recent(+b.dataset.weeks);render();});$('month-preset').onclick=()=>{state.ranges[state.view]={...initial};render();};
let todayExpiry=0;
$('today-preset').onclick=async()=>{
 const button=$('today-preset'),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!records.some(d=>!d.provisional&&d.date!==today)){$('range-error').textContent=t('비교할 완료 날짜가 없습니다');return;}
 button.disabled=true;$('range-error').textContent=t('오늘 항공편을 확인 중입니다');
 try{const row=await snapshot.loadToday(today),nowDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(nowDay!==today)throw Error('date changed');const old=records.findIndex(d=>d.provisional);if(old>=0)records.splice(old,1);records.push(row);records.sort((a,b)=>a.date.localeCompare(b.date));modelCache.clear();const r=state.ranges.rhythm,baseline=r.aStart===r.aEnd&&r.aStart!==today?r.aStart:latest;state.ranges.rhythm={aStart:baseline,aEnd:baseline,bStart:today,bEnd:today};render();clearTimeout(todayExpiry);todayExpiry=setTimeout(()=>{const i=records.findIndex(d=>d.provisional);if(i>=0)records.splice(i,1);modelCache.clear();render();$('range-error').textContent=t('날짜가 바뀌었습니다. 당일 비교를 다시 눌러 주세요');},Math.max(1,Date.parse(shift(today,1)+'T00:00:00+09:00')-Date.now()+100));}
 catch{$('range-error').textContent=t('오늘 항공편을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요');}finally{button.disabled=false;}
};
$('today-compare-date').onchange=e=>{const value=e.target.value;if(!value)return;state.ranges.rhythm={...state.ranges.rhythm,aStart:value,aEnd:value};render();};
document.querySelectorAll('[data-terminal-event]').forEach(button=>button.onclick=async()=>{
 const event=terminalEvents[button.dataset.terminalEvent];if(!event)return;
 const r={aStart:shift(event.date,-28),aEnd:shift(event.date,-1),bStart:event.date,bEnd:shift(event.date,27)};
 state.ranges.terminal=r;render();button.disabled=true;$('terminal-event-status').textContent=event.name+t(' 이전 전후 기록 확인 중');
 try{const historical=normalize({history:await snapshot.loadHistory(shift(event.date,28))}).days,existing=new Set(records.map(d=>d.date));for(const row of historical)if(!existing.has(row.date))records.push(row);records.sort((a,b)=>a.date.localeCompare(b.date));modelCache.clear();if(state.view==='terminal'&&JSON.stringify(state.ranges.terminal)===JSON.stringify(r)){render();$('terminal-event-status').innerHTML=event.name+' T1 → T2 · '+event.date+t(' · 전후 차이 비교 · 이전 효과 입증 아님 · <a target="_blank" rel="noreferrer" href="')+event.url+t('">이전 공지 확인 ↗</a>');}}
 catch{if(state.view==='terminal'&&JSON.stringify(state.ranges.terminal)===JSON.stringify(r))$('terminal-event-status').textContent=t('이전 기간의 기록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요');}finally{button.disabled=false;}
});
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{state.scope=b.dataset.scope;render();});document.querySelectorAll('[data-measure]').forEach(b=>b.onclick=()=>{state.measure=b.dataset.measure;render();});
document.querySelectorAll('[data-view]').forEach(b=>{b.onclick=()=>{state.view=b.dataset.view;render();};b.onkeydown=e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const tabs=[...document.querySelectorAll('[data-view]')],i=tabs.indexOf(b);let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();tabs[next].click();tabs[next].focus();}};});
$('country-select').innerHTML=countries.map(c=>'<option value="'+c+'">'+countryName(c)+'</option>').join('');$('country-select').onchange=()=>{state.country=$('country-select').value;render();};$('peak-window').onchange=()=>{state.peak=+$('peak-window').value;render();};
$('country-jump').onclick=()=>{if(parent!==window)parent.postMessage({type:'koretail-open-country-flights',ranges:state.ranges[state.view]},location.origin);else $('announcement').textContent=t('통합 시안의 국가별 흐름에서 같은 기간으로 열기');};
if(parent!==window)document.body.classList.add('embedded');
window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='koretail-insights-view'&&views.includes(e.data.view)){state.view=e.data.view;if(e.data.ranges&&!validateRanges(e.data.ranges))state.ranges[state.view]={...e.data.ranges};render();}});
$('coverage').textContent=t('시간대 ')+range(records[0]?.date,records.at(-1)?.date)+t(' · 완료 ')+records.length+t('일');
let pendingHeight=0,lastHeight=0;function reportHeight(){if(parent===window||pendingHeight)return;pendingHeight=requestAnimationFrame(()=>{pendingHeight=0;const height=Math.ceil(document.body.getBoundingClientRect().height);if(Math.abs(height-lastHeight)>1){lastHeight=height;parent.postMessage({type:'koretail-insights-height',height},location.origin);}});}
new ResizeObserver(reportHeight).observe(document.body);document.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',reportHeight));render();document.documentElement.dataset.previewReady='true';if(parent!==window)parent.postMessage({type:'koretail-insights-ready'},location.origin);
let resizePending=0;window.addEventListener('resize',()=>{if(['rhythm','weekday','holiday'].includes(state.view)&&!resizePending)resizePending=requestAnimationFrame(()=>{resizePending=0;if(activeModel?.available)({rhythm:lineChart,weekday:weekdayChart,holiday:holidayChart}[state.view])(activeModel);reportHeight();});});



}
