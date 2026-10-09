'use client';
import {useId,useState,type CSSProperties} from 'react';
import type {Lang} from './retailpulse-data';
import type {SeoulContext} from '../lib/seoul-context';
import {commercialComposition,compositionRingPath} from '../lib/commercial-composition';
import {commercialChartAxes,type CommercialChartMetric} from '../lib/commercial-category-chart';
import {CommercialCategoryRow,commercialLocales} from './commercial-category-row';
import {commercialCategoryIcons,commercialCategoryFallback} from './commercial-category-icons';

const names:Record<string,Record<Lang,string>>={
 '제과/커피/패스트푸드':{ko:'베이커리·카페',en:'Bakery · café',zh:'烘焙·咖啡',ja:'ベーカリー・カフェ'},
 '스포츠/문화/레저':{ko:'문화·레저',en:'Culture · leisure',zh:'文化·休闲',ja:'文化・レジャー'},
 '할인점/슈퍼마켓':{ko:'식료품',en:'Groceries',zh:'食品超市',ja:'食料品'},
 '의복/의류':{ko:'의류',en:'Clothing',zh:'服装',ja:'衣料品'},
 '일식/중식/양식':{ko:'세계음식',en:'World food',zh:'各国料理',ja:'各国料理'},
 '패션/잡화':{ko:'패션·잡화',en:'Accessories',zh:'时尚·杂货',ja:'ファッション・雑貨'},
 '기타요식':{ko:'기타 음식',en:'Other dining',zh:'其他餐饮',ja:'その他の飲食'},
 '편의점':{ko:'편의점',en:'Convenience',zh:'便利店',ja:'コンビニ'},
 '여행':{ko:'여행 업종',en:'Travel industry',zh:'旅行行业',ja:'旅行業種'},
 '한식':{ko:'한식',en:'Korean food',zh:'韩餐',ja:'韓国料理'},
 '약국':{ko:'약국',en:'Pharmacy',zh:'药店',ja:'薬局'},
 '화장품':{ko:'화장품',en:'Cosmetics',zh:'化妆品',ja:'化粧品'},
};
const tint=(hex:string,target:string,amount:number)=>'#'+hex.slice(1).match(/../g)!.map((v,i)=>Math.round(parseInt(v,16)+(parseInt(target.slice(i*2,i*2+2),16)-parseInt(v,16))*amount).toString(16).padStart(2,'0')).join('');
function CategoryMiniature({src}:{src:string}) {
 const [failed,setFailed]=useState(false);
 // The category name and fixed image box survive a failed asset request.
 const key=(failed?'fallback-128.webp':src.split('/').at(-1)!).replace('-128.webp','');
 // eslint-disable-next-line @next/next/no-img-element -- Precomputed responsive WebPs need no runtime transform.
 return <img srcSet={failed?undefined:`${src} 128w, /commercial-icons/sharp-v1/${key}-256.webp 256w`} sizes="(max-width:600px) 48px, 52px" src={failed?'/commercial-icons/miniatures/fallback-128.webp':src} onError={()=>setFailed(true)} width="48" height="48" alt="" loading="lazy" decoding="async"/>;
}
export function CommercialComposition({context,lang}:{context:SeoulContext;lang:Lang}) {
 const id=useId(),[selected,setSelected]=useState<string|null>(null),[metric,setMetric]=useState<CommercialChartMetric>('payments');
 const model=commercialComposition(context.categories),axes=commercialChartAxes(context.categories);
 const number=new Intl.NumberFormat(commercialLocales[lang]);
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 const active=model.segments.find(s=>s.key===selected);
 const present=model.segments.filter(s=>(s.ratio??0)>0);
 return <div className="consumption-categories composition-card" data-testid="commercial-composition" data-status={model.status}>
  <h3>{t('어떤 업종에서 소비하나요?','Activity by business category','哪些行业有消费？','どの業種で消費していますか？')}</h3>
  <small>{t('서울시·신한카드 내국인 소비 · 10분 관측','Seoul/Shinhan domestic-card activity · 10-minute observation','首尔市·新韩卡本国人消费 · 10分钟观测','ソウル市・新韓カード国内消費・10分間の観測')} · {context.commercialAt?`${context.commercialAt.slice(5,16).replace('T',' ')} KST`:t('관측 시각 미제공','Observation time not supplied','未提供观测时间','観測時刻未提供')}</small>
  <div className="commercial-composition-layout">
   <div className="commercial-ring-stage">
    <svg viewBox="0 0 300 309" className="commercial-donut" aria-hidden="true" data-surface="svg-satin-ceramic">
     <defs>
      <filter id={`${id}-contact`} x="-12%" y="-12%" width="124%" height="130%"><feDropShadow dx=".5" dy="2.7" stdDeviation="2.1" floodColor="#3a5568" floodOpacity=".12"/></filter>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".78"/><stop offset=".42" stopColor="#fff" stopOpacity=".22"/><stop offset="1" stopColor="#274a60" stopOpacity=".24"/></linearGradient>
      <linearGradient id={`${id}-inner`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#274a60" stopOpacity=".3"/><stop offset=".48" stopColor="#fff" stopOpacity=".08"/><stop offset="1" stopColor="#fff" stopOpacity=".85"/></linearGradient>
      {present.map((s,i)=><linearGradient key={s.key} id={`${id}-face-${i}`} gradientUnits="userSpaceOnUse" x1="52" y1="32" x2="248" y2="271"><stop stopColor={tint(s.color,'ffffff',.22)}/><stop offset=".43" stopColor={s.color}/><stop offset="1" stopColor={tint(s.color,'294657',.17)}/></linearGradient>)}
     </defs>
     <circle cx="150" cy="150" r="99" fill="none" stroke="#edf2f5" strokeWidth="44"/>
     <g filter={`url(#${id}-contact)`} transform="translate(0 3)">{present.map(s=><path key={s.key} d={compositionRingPath(s.start,s.end)} fill={tint(s.color,'294657',.24)}/>)}</g>
     {present.map((s,i)=><g key={s.key} data-ratio={s.ratio}>
      <path d={compositionRingPath(s.start,s.end)} fill={`url(#${id}-face-${i})`}/>
      <path d={compositionRingPath(s.start,s.end,121,117.8)} fill={`url(#${id}-rim)`}/>
      <path d={compositionRingPath(s.start,s.end,80.2,77)} fill={`url(#${id}-inner)`}/>
      <path d={compositionRingPath(s.start,s.end)} fill="none" stroke="#f7fafb" strokeWidth=".65" strokeOpacity=".9"/>
     </g>)}
    </svg>
    <div className="commercial-donut-center"><strong>{model.complete?number.format(model.total):'—'}</strong><small>{t('건','payments','笔','件')}</small><span>{t('공개 업종 합계','Published category total','公开行业合计','公開業種の合計')}</span></div>
   </div>
   <div className="commercial-miniature-grid" role="group" aria-label={t('전체 업종 결제 비중','Payment shares for all categories','所有行业支付占比','全業種の決済割合')}>
    {model.segments.map(s=>{const icon=commercialCategoryIcons[s.row.category]??commercialCategoryFallback;return <button type="button" className="commercial-miniature-card" key={s.key} data-category={s.row.category} style={{'--slice':s.color} as CSSProperties} aria-label={`${s.row.category}, ${s.ratio===null?'—':`${new Intl.NumberFormat(commercialLocales[lang],{maximumFractionDigits:1}).format(s.ratio*100)}%`}`} aria-pressed={selected===s.key} aria-controls={`${id}-selected`} onClick={()=>setSelected(selected===s.key?null:s.key)} title={s.row.category}>
     <CategoryMiniature src={icon.src.replace('/commercial-icons/','/commercial-icons/miniatures/').replace('-64.webp','-128.webp')}/>
     <span className="commercial-short-name">{names[s.row.category]?.[lang]??s.row.category}</span><strong className="commercial-share">{s.ratio===null?'—':`${new Intl.NumberFormat(commercialLocales[lang],{maximumFractionDigits:1}).format(s.ratio*100)}%`}</strong>
    </button>;})}
   </div>
  </div>
  <div className="context-more"><p className="context-category-count">{t(`공개 업종 ${model.segments.length}개를 모두 표시했습니다.`,`Showing all ${model.segments.length} published categories.`,`已显示全部${model.segments.length}个公开行业。`,`公開された${model.segments.length}業種をすべて表示しています。`)}</p></div>
  {!model.segments.length&&<p className="commercial-category-empty">{t('업종 자료 미제공 · 결제 0건을 뜻하지 않습니다.','Category data not supplied · this does not mean zero payments.','未提供行业数据 · 不代表零支付。','業種データ未提供・決済0件を意味しません。')}</p>}
  <p className="commercial-denominator">{model.complete?t(`같은 관측 시각·분류의 ${model.segments.length}개 업종 결제 ${number.format(model.total)}건 기준`,`Based on ${number.format(model.total)} payments across all ${model.segments.length} categories at the same observation`,`基于同一观测时间全部${model.segments.length}个行业的${number.format(model.total)}笔支付`,`同じ観測時刻の全${model.segments.length}業種・${number.format(model.total)}件の決済が分母`):t('미제공·중복 분류가 있어 전체 비중은 계산하지 않습니다.','Full shares are unavailable when counts or classifications are incomplete.','数量或分类不完整，无法计算全部占比。','件数・分類が不完全なため全体割合は算出しません。')} · {t('결제 건수는 사람 수·매출 증가율이 아닙니다.','Payments are not people or sales growth.','支付笔数不等于人数或销售增长率。','決済件数は人数・売上成長率ではありません。')}</p>
  <div id={`${id}-selected`} className="commercial-selected" aria-live="polite">{active&&<ul className="context-category-list"><CommercialCategoryRow row={active.row} lang={lang} metric={metric} axes={axes}/></ul>}</div>
  <details className="commercial-full-details"><summary>{t(`업종 ${model.segments.length}개 · 금액과 활동 수준 전체 보기`,`All ${model.segments.length} categories · amounts and activity levels`,`${model.segments.length}个行业 · 查看全部金额和活跃度`,`${model.segments.length}業種・金額と活動水準をすべて見る`)}</summary>
   <div className="commercial-chart-controls" role="group" aria-label={t('상세 차트 기준','Detail chart metric','详细图表指标','詳細チャートの指標')}>
    <button type="button" aria-pressed={metric==='payments'} onClick={()=>setMetric('payments')}>{t('결제 건수','Payment count','支付笔数','決済件数')}</button><button type="button" aria-pressed={metric==='amount'} onClick={()=>setMetric('amount')}>{t('금액 범위','Amount range','金额范围','金額範囲')}</button>
   </div>
   <ul className="context-category-list">{model.segments.map(s=><CommercialCategoryRow key={s.key} row={s.row} lang={lang} metric={metric} axes={axes}/>)}</ul>
   <p className="commercial-denominator">{t('금액은 공개된 최소~최대 범위입니다. 활동 수준은 서울시의 별도 등급이며 결제 비중을 결정하지 않습니다.','Amounts preserve published minimum–maximum ranges. Seoul activity grades do not determine payment shares.','金额保留公开的最小至最大范围。首尔活跃度等级不决定支付占比。','金額は公開された最小～最大範囲です。活動水準は決済割合を決定しません。')}</p>
  </details>
 </div>;
}
