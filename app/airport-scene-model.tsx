'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import views from '../config/airport-concept-v14.json';
import previewViews from '../config/airport-concept-v6c.preview.json';
import { airportScene } from '../lib/airport-scene';
import type { Lang } from './retailpulse-data';
import './airport-scene-model.css';

export type AirportSceneScope = 'all' | 'T1' | 'T2' | 'CONCOURSE';
const previewRoot = import.meta.env?.DEV ? (import.meta.env as { VITE_AIRPORT_MODEL_PREVIEW_ROOT?: string }).VITE_AIRPORT_MODEL_PREVIEW_ROOT : '';
export function airportSceneView(scope: AirportSceneScope): {width:number; height:number; labels:Record<string,number[]>} {
  const key = scope === 'all' ? 'OVERVIEW_2ROW' : scope;
  return previewRoot ? previewViews.views[key] : views.views[key];
}
const concept = {
  ko: '건물 비교용 개념 모형 · 실제 지리 배치가 아닙니다.',
  en: 'Concept building comparison · not a geographic layout.',
  zh: '建筑比较概念模型 · 非实际地理布局。',
  ja: '建物比較用の概念模型 · 実際の地理配置ではありません。',
};
const lighting = {
  ko: '조명은 현재 한국 시각 기준(주간 06–18시) · 데이터 상태와 무관',
  en: 'Lighting uses current Korea time (day 06–18) · independent of data status',
  zh: '照明按当前韩国时间（日间06–18时）· 与数据状态无关',
  ja: '照明は現在の韓国時刻（昼間06–18時）· データ状態とは無関係',
};
export function airportLightingBasis(lang:Lang) { return lighting[lang]; }
export function AirportSceneModel({scope,lang,className='',showBasis=true,children}:{scope:AirportSceneScope;lang:Lang;className?:string;showBasis?:boolean;children?:React.ReactNode}) {
  const [scene,setScene]=useState(()=>airportScene(Date.now()));
  useEffect(()=>{const update=()=>setScene(airportScene(Date.now()));update();const timer=setInterval(update,60_000);return()=>clearInterval(timer);},[]);
  const view=airportSceneView(scope);
  const responsive=scope==='all'&&!previewRoot;
  const mobile=views.mobileOverview;
  const stem=`/airport-models/v14/${scope === 'all' ? 'OVERVIEW_LANDSCAPE' : scope}_${scene}`;
  const mobileStem=`/airport-models/v14/OVERVIEW_MOBILE_${scene}`;
  const src=previewRoot ? `/@fs/${previewRoot}/${scope === 'all' ? 'OVERVIEW' : scope}_${scene}.webp` : `${stem}.webp`;
  const reservedStyle={aspectRatio:responsive?'var(--airport-overview-ratio)':`${view.width}/${view.height}`,
    '--airport-overview-wide-ratio':`${view.width}/${view.height}`,
    '--airport-overview-mobile-ratio':`${mobile.width}/${mobile.height}`} as CSSProperties;
  // eslint-disable-next-line @next/next/no-img-element
  const image=<img src={src} srcSet={previewRoot?undefined:`${stem}-390.webp 390w, ${stem}-900.webp 900w, ${stem}.webp ${view.width}w`} sizes="(max-width: 732px) calc(100vw - 32px), 700px" width={view.width} height={view.height} alt="" loading="lazy" decoding="async"/>;
  return <>
    <div className={`airport-scene-picture ${className}${responsive?' airport-scene-overview-v14':''}`} style={reservedStyle} data-scene={scene} data-building={scope}>
      {/* Only the selected building and lighting image is requested. */}
      {responsive?<picture><source media="(max-width: 600px)" srcSet={`${mobileStem}-390.webp 390w, ${mobileStem}-900.webp 900w, ${mobileStem}.webp ${mobile.width}w`} sizes="calc(100vw - 32px)" width={mobile.width} height={mobile.height}/>{image}</picture>:image}
      {scope==='all'&&Object.entries(view.labels).map(([name,point])=>{
        const narrow=mobile.labels[name as keyof typeof mobile.labels];
        const style=responsive?{left:'var(--airport-anchor-x)',top:'var(--airport-anchor-y)',
          '--airport-anchor-wide-x':`${point[0]/view.width*100}%`,'--airport-anchor-wide-y':`${point[1]/view.height*100}%`,
          '--airport-anchor-mobile-x':`${narrow[0]/mobile.width*100}%`,'--airport-anchor-mobile-y':`${narrow[1]/mobile.height*100}%`} as CSSProperties
          :{left:`${point[0]/view.width*100}%`,top:`${point[1]/view.height*100}%`};
        return <span className="airport-scene-anchor" key={name} style={style}>{name==='CONCOURSE'?{ko:'탑승동',en:'Concourse',zh:'登机楼',ja:'搭乗棟'}[lang]:name}</span>;
      })}
      {children}
    </div>
    {showBasis && <details className="prep-evidence airport-scene-note"><summary>{{ko:'집계 기준 · 모형과 조명',en:'Counting basis · model and lighting',zh:'统计口径 · 模型与光照',ja:'集計基準 · 模型と照明'}[lang]}</summary><p className="prep-note">{concept[lang]} {lighting[lang]}</p></details>}
  </>;
}
