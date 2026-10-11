import type {Lang} from './retailpulse-data';
import {checkpointLayout} from '../lib/airport-checkpoint-layout';
import {queueHeat,queueHeatLabel,type QueueHeatReading} from '../lib/airport-queue-heat';
import {displayedQueueMinutes} from '../lib/airport-queue-representatives';
import './airport-checkpoint-schematic.css';
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
export function AirportCheckpointSchematic({terminal,rows,now,lang}:{terminal:'T1'|'T2';rows:readonly QueueHeatReading[];now:number;lang:Lang}) {
 const groups=checkpointLayout(terminal,rows),minute=t(lang,'분','min','分','分');
 const observed=[...new Set(groups.flat().flatMap(slot=>slot.row?[slot.row.observedAt]:[]))].filter(at=>Number.isFinite(Date.parse(at))).sort();
 const stamp=(at:string)=>new Intl.DateTimeFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
 return <figure className="checkpoint-schematic" data-testid="checkpoint-schematic" data-terminal={terminal}>
  <figcaption><strong>{terminal}</strong> {t(lang,'출국장 대기','Departure-hall waits','出境区等候','出国場の待ち時間')}</figcaption>
  <div className="checkpoint-schematic-stage">
   {/* eslint-disable-next-line @next/next/no-img-element -- Original, responsive Blender render; fixed dimensions. */}
   <img src="/visuals/airport-queue/checkpoint-base-480.webp" srcSet="/visuals/airport-queue/checkpoint-base-480.webp 480w, /visuals/airport-queue/checkpoint-base-960.webp 960w" sizes="(max-width:600px) calc(100vw - 36px), 640px" width="960" height="400" alt="" loading="lazy" decoding="async"/>
   <div className="checkpoint-schematic-groups">{groups.map((group,index)=><div className="checkpoint-schematic-group" key={index}>
    {terminal==='T1'&&<span className="checkpoint-group-name">{group[0].key.slice(0,1)}</span>}
    <div className="checkpoint-schematic-pair">{group.map(slot=>{
     const heat=slot.row?queueHeat(slot.row,now):{level:'neutral' as const,state:'missing' as const};
     const value=slot.row?displayedQueueMinutes(slot.row):null;
     const name=terminal==='T1'?slot.key.endsWith('W')?t(lang,'서','W','西','西'):t(lang,'동','E','东','東'):slot.key;
     const shown=heat.state==='closed'?t(lang,'종료','Off','关闭','終了'):value===null?'—':`${value}${slot.row?.waitTimeRaw==='60+'?'+':''}`;
     return <div className="checkpoint-schematic-reading" key={slot.key} data-checkpoint={slot.key} data-state={heat.state} data-wait-level={heat.level} aria-label={`${terminal} ${slot.key} · ${shown} ${value===null?'':minute} · ${queueHeatLabel(heat,lang)}`}>
      <span>{name}</span><strong>{shown}{value!==null&&heat.state!=='closed'&&<small>{minute}</small>}{heat.state==='zero'&&<sup>*</sup>}</strong>
     </div>;
    })}</div>
   </div>)}</div>
  </div>
  <p className="checkpoint-schematic-time">{t(lang,'대기 관측','Wait observation','等候观测','待ち時間の観測')}: {observed.length?observed.length===1?stamp(observed[0]):`${stamp(observed[0])} / ${stamp(observed.at(-1)!)}`:'—'} KST{observed.length>1?` · ${t(lang,'출국장별 시각 차이 있음','Clocks differ by hall','各出境区时刻不同','出国場ごとに時刻差あり')}`:''}</p>
  <p className="checkpoint-schematic-basis">{terminal==='T1'?t(lang,'2–5번 출국장 내부 동·서 · 항공편 구역과 별도','Local east/west within halls 2–5, separate from flight zones','2至5号出境区内部东西侧，与航班区域不同','2～5番出国場の内部東西。便の区画とは別'):t(lang,'1A–2D 출국장 · 공식 위치 좌표와 별도인 개념도','Halls 1A–2D · schematic, not official coordinates','1A至2D出境区 · 示意图，非官方坐标','1A～2D出国場・公式座標ではない概念図')}</p>
  <p className="checkpoint-schematic-basis">{t(lang,'— 미확인 · *0분은 운영 여부 확인 필요 · 오래된 값은 회색','— unconfirmed · *0 min needs an operating-status check · old readings are grey','— 未确认 · *0分钟需确认是否运营 · 较早记录为灰色','— 未確認・*0分は運営状況を確認・古い値はグレー')}</p>
  {terminal==='T1'&&<p className="checkpoint-schematic-basis">{t(lang,'색상은 코리테일 대기분 기준이며 공식 T1 혼잡 등급이 아닙니다. 1·6번은 이 API의 확인된 관측 범위에 없습니다.','Colors use KORETAIL minute criteria, not official T1 grades. Halls 1 and 6 are outside this API’s verified observation scope.','颜色使用KORETAIL分钟标准，并非T1官方拥挤等级。1及6号不在此API已确认观测范围。','色はKORETAILの待ち分基準で、T1の公式混雑等級ではありません。1・6番は本APIの確認済み観測範囲外です。')}</p>}
 </figure>;
}
