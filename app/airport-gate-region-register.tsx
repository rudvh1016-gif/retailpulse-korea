'use client';
import {useState,type ReactNode} from 'react';
import {gateIntervals,registeredGateRegions,type RegisteredBuilding} from '../lib/airport-gate-regions';
import {mapCopy} from '../lib/airport-departure-map-copy';
import type {Lang} from './retailpulse-data';

const text={
 ko:{title:'구역에 등록된 전체 게이트',note:'현재 운항 게이트·편수 순위와 다릅니다. 공식 지도 좌표를 계산한 구역은 공항의 공식 동서 구분이 아닙니다.',all:'구역 기준·게이트 번호 보기',official:'공항 공식 문구',position:'공식 지도 좌표 · KORETAIL 계산',unknown:'분류 근거 미확인',none:'등록 번호 없음',map:'공식 지도'},
 en:{title:'All registered gates by zone',note:'Separate from active gates and flight rankings. Zones calculated from official map coordinates are not official east/west designations.',all:'View zone criteria and gate numbers',official:'Official airport text',position:'Official map coordinates · KORETAIL calculation',unknown:'Classification unverified',none:'No registered numbers',map:'Official map'},
 zh:{title:'各区域全部登记登机口',note:'与当前运行登机口及航班排名不同。按官方地图坐标计算的区域不等于机场官方东西方名称。',all:'查看区域划分依据与登机口编号',official:'机场官方文字',position:'官方地图坐标 · KORETAIL计算',unknown:'分类依据未确认',none:'无登记编号',map:'官方地图'},
 ja:{title:'区域別の全登録搭乗口',note:'現在の運航搭乗口や便数順位とは別です。公式地図の座標から算出した区域は空港公式の東西名称ではありません。',all:'区域の基準・搭乗口番号を見る',official:'空港の公式文言',position:'公式地図座標 · KORETAIL算出',unknown:'分類根拠未確認',none:'登録番号なし',map:'公式地図'},
};
export function AirportGateRegionRegister({scope,lang,children}:{scope:'all'|RegisteredBuilding;lang:Lang;children?:ReactNode}) {
 const [open,setOpen]=useState(false);const c=text[lang];
 const buildings:RegisteredBuilding[]=scope==='all'?['T1','T2','CONCOURSE']:[scope];
 return <details className="airport-gate-region-register prep-evidence" data-testid="gate-region-register" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary style={{touchAction:'manipulation'}}><span aria-hidden="true" style={{marginInlineEnd:8}}>{open?'−':'+'}</span>{c.all}</summary>
  {children}
  <h4>{c.title}</h4><p className="prep-note">{c.note}</p>
  {buildings.map(building=>{const rows=registeredGateRegions(building);return <div key={building} data-building={building}>
   <p>{mapCopy.building[building][lang]}</p>
   <div className="gate-region-columns">{(['WEST','CENTER','EAST'] as const).map(side=><div key={side} data-side={side}><strong>{mapCopy.side[side][lang]}</strong><span>{gateIntervals(rows.filter(g=>g.side===side).map(g=>g.gate))||c.none}</span></div>)}</div>
   <p className="prep-note" data-side="UNVERIFIED">{mapCopy.side.UNVERIFIED[lang]}: {gateIntervals(rows.filter(g=>g.side==='UNVERIFIED').map(g=>g.gate))||c.none}</p>
  </div>;})}
  {open&&buildings.map(building=><ul key={building}>{registeredGateRegions(building).map(g=><li key={g.gate} data-gate={g.gate} data-side={g.side} data-basis={g.basis??'UNVERIFIED'}>{mapCopy.building[building][lang]} {g.gate} · {mapCopy.side[g.side][lang]} · {g.basis==='OFFICIAL_TEXT'?c.official:g.basis?c.position:c.unknown}{g.evidence&&<small>{g.evidence}</small>}</li>)}</ul>)}
  <a href="https://www.airport.kr/geomap/ap_ko/view.do" target="_blank" rel="noreferrer">{c.map}</a>
 </details>;
}
