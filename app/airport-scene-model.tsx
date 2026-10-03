'use client';
import { useEffect, useState } from 'react';
import views from '../config/airport-concept-v5.json';
import { airportScene } from '../lib/airport-scene';
import type { Lang } from './retailpulse-data';

export type AirportSceneScope = 'all' | 'T1' | 'T2' | 'CONCOURSE';
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
export function AirportSceneModel({scope,lang,className='',children}:{scope:AirportSceneScope;lang:Lang;className?:string;children?:React.ReactNode}) {
  const [scene,setScene]=useState(()=>airportScene(Date.now()));
  useEffect(()=>{const update=()=>setScene(airportScene(Date.now()));update();const timer=setInterval(update,60_000);return()=>clearInterval(timer);},[]);
  const key=scope==='all'?'OVERVIEW_2ROW':scope;
  const view=views.views[key];
  return <>
    <div className={`airport-scene-picture ${className}`} style={{aspectRatio:`${view.width}/${view.height}`}} data-scene={scene} data-building={scope}>
      {/* Only the selected building and lighting image is requested. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/airport-models/v5/${key}_${scene}.webp`} width={view.width} height={view.height} alt="" loading="lazy" decoding="async"/>
      {scope==='all'&&Object.entries(view.labels).map(([name,point])=><span className="airport-scene-anchor" key={name} style={{left:`${point[0]/view.width*100}%`,top:`${point[1]/view.height*100}%`}}>{name==='CONCOURSE'?{ko:'탑승동',en:'Concourse',zh:'登机楼',ja:'搭乗棟'}[lang]:name}</span>)}
      {children}
    </div>
    <details className="prep-evidence airport-scene-note"><summary>{{ko:'집계 기준 · 모형과 조명',en:'Counting basis · model and lighting',zh:'统计口径 · 模型与光照',ja:'集計基準 · 模型と照明'}[lang]}</summary><p className="prep-note">{concept[lang]} {lighting[lang]}</p></details>
  </>;
}
