import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const known=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;

/** Compare the same September-leading category in both months, never revenues. */
export function panpanMonthlyRows(data){
 return data.stores.map((store,index)=>{
  const before=data.values[7]?.[index],after=data.values[8]?.[index];
  if(!after||after.length!==data.categories.length||!after.every(known))return {store,available:false};
  const category=after.indexOf(Math.max(...after));
  if(!known(before?.[category]))return {store,category:data.categories[category],available:false};
  return {store,category:data.categories[category],available:true,before:before[category],after:after[category],delta:Number((after[category]-before[category]).toFixed(1))};
 });
}

export function renderPanpanMonthlySummary(data){
 const rows=panpanMonthlyRows(data).map(row=>{
  const reading=row.available?`<p class="monthly-summary-category">9월 1위 품목 · ${escape(row.category)}</p><p class="monthly-summary-values">8월 ${row.before.toFixed(1)}% → 9월 ${row.after.toFixed(1)}% <strong>${row.delta>0?'+':row.delta<0?'△ ':''}${Math.abs(row.delta).toFixed(1)}%p ${row.delta>0?'증가':row.delta<0?'감소':'변화 없음'}</strong></p>`:'<p class="monthly-summary-missing">전월 비교 자료 없음</p>';
  return `<li class="monthly-summary-store"><h3>${escape(row.store)}</h3>${reading}</li>`;
 }).join('');
 return `<section id="monthly-mix" class="monthly-mix" aria-labelledby="monthly-mix-title"><div class="eyebrow">판판면세점 6개 매장 · 확인 자료 2026년 8월 → 9월</div><h2 id="monthly-mix-title">판판 매장, 최근 한 달의 변화</h2><p>각 매장의 9월 1위 품목을 같은 품목의 8월 구성비와 비교합니다. 매출액 증감이 아닌 구성비 차이(%p)입니다.</p><ul class="monthly-summary-list">${rows}</ul><p class="caption">이 페이지의 확인 자료는 2026년 1~9월입니다. 이후 월의 비교 자료는 미확인입니다.</p><div class="links"><a href="${escape(data.source)}" target="_blank" rel="noopener">판판 매장 구성비 원자료 ↗</a></div></section>`;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const data=JSON.parse(readFileSync('data/shopping-briefing-panpan-2026.json','utf8'));
 const file='public/shopping-report/index.html';
 const original=readFileSync(file,'utf8');
 const stripped=original.replace(/<section id="monthly-mix"[\s\S]*?<\/section>/,'');
 if(stripped===original)throw new Error('Expected exactly one existing monthly summary');
 writeFileSync(file,stripped.replace('</main>',renderPanpanMonthlySummary(data)+'</main>'));
}
