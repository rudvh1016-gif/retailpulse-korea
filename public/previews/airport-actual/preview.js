// Explicit synthetic design fixtures. Never used by production APIs or collection.
const examples=[
 {country:'예시 국가 A',passengers:[9300,9000],flights:[310,330]},
 {country:'예시 국가 B',passengers:[6200,7200],flights:[248,270]},
 {country:'예시 국가 C',passengers:[4650,4500],flights:[155,150]},
 {country:'예시 국가 D',passengers:[3100,2400],flights:[124,90]},
];
let metric='passengers';
const find=id=>document.getElementById(id),format=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:1});
function render(){
 const demo=find('example').checked,month=find('month').value,days=month==='202609'?30:31,index=month==='202609'?1:0,unit=metric==='passengers'?'명':'편';
 document.querySelectorAll('[data-metric]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.metric===metric)));
 find('basis').textContent=(demo?'표시 예시 · 실제 데이터 아님 · ':'자료 미확보 · ')+`인천공항 전체 출발 · ${days}일 · ${metric==='passengers'?'실제 여객 통계':'항공편 통계'} 기준`;
 if(!demo){find('month-summary').textContent='월 합계 — · 일평균 —';find('countries').innerHTML='<tr><td colspan="5" class="empty">조회 권한 확인 후 표시합니다. 0명·0편으로 해석하지 마세요.</td></tr>';find('hours').innerHTML='<p class="empty">시간대 자료 미확보 —</p>';find('schedules').innerHTML='<p class="empty">정기편 자료 미확보 — · 전체 노선 조회 미검증</p>';return;}
 const rows=examples.map(row=>({...row,value:row[metric][index]})).sort((a,b)=>b.value-a.value),sum=rows.reduce((n,row)=>n+row.value,0);
 find('month-summary').innerHTML=`<span class="example-tag">표시 예시 · 실제 데이터 아님</span><br><strong>${format(sum)}</strong>${unit} / 월 · 일평균 ${format(sum/days)}${unit}`;
 find('countries').innerHTML=rows.map(row=>{const average=row.value/days,previous=row[metric][0]/31,change=index?(average-previous)/previous*100:null;const changeText=change===null?'—':Math.abs(change)<.00001?'0%':`${change>0?'+':'△'}${format(Math.abs(change))}%`;return `<tr><td>${row.country}<i class="country-bar" style="width:${row.value/rows[0].value*100}px"></i></td><td>${format(row.value)}${unit}</td><td>${format(average)}${unit}</td><td aria-label="${change===null?'이전 월 예시 없음':change<0?'감소':change>0?'증가':'변화 없음'}">${changeText}</td><td>${format(row.value/sum*100)}%</td></tr>`}).join('');
 // Independent hourly example, not a cross-tab with the country fixtures.
 const hours=[['00:00–05:59',1200],['06:00–11:59',8600],['12:00–17:59',10400],['18:00–23:59',6900]];
 find('hours').innerHTML='<span class="example-tag">독립 표시 예시 · 실제 데이터 아님</span>'+hours.map(([time,count])=>`<div class="hour"><span>${time}</span><i style="width:${count/10400*100}%"></i><b>${format(count)}명</b></div>`).join('');
 find('schedules').innerHTML='<span class="example-tag">가상 노선 · 실제 운항 정보 아님</span><div class="schedule"><div><strong>예시 항공 · DEMO001</strong><p>인천 → 예시 공항 A</p></div><div><strong>08:30</strong><p>월 · 수 · 금</p></div><div><small>적용 기간</small><p>2026.10.01–10.31</p></div></div>';
}
find('example').addEventListener('change',render);find('month').addEventListener('change',render);document.querySelectorAll('[data-metric]').forEach(button=>button.addEventListener('click',()=>{metric=button.dataset.metric;render()}));render();
