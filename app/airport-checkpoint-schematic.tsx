'use client';
import {useEffect,useRef} from 'react';
import type {Lang} from './retailpulse-data';
import {longestCheckpoint} from '../lib/checkpoint-longest';
import {CHECKPOINT_SOURCE_URLS,checkpointLayout} from '../lib/airport-checkpoint-layout';
import {queueHeat,queueHeatLabel,type QueueHeatReading} from '../lib/airport-queue-heat';
import {displayedQueueMinutes} from '../lib/airport-queue-representatives';
import {friendlyCheckpointName} from '../lib/airport-today-summary';
import './airport-checkpoint-schematic.css';

const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
type CheckpointReading=QueueHeatReading & {waitingCount?:number|null};
/** Floor marker in front of each lane of the base render (960×400), left to
 * right in CHECKPOINT_GROUPS order. Both terminals use the same drawing. */
const LANE_ANCHORS=[[139,279],[198,279],[346,238],[406,238],[553,240],[612,240],[760,279],[819,279]] as const;
/** Each reading sits in one of eight equal columns under the drawing and is
 * tied to its lane by a leader, so the left-to-right order is the floor order. */
const leaderPath=(index:number)=>{const [x,y]=LANE_ANCHORS[index],column=(index+.5)*120;return `M${x} ${y+6}V352L${column} 400`;};

export function AirportCheckpointSchematic({terminal,rows,now,lang,showSeverity=false}:{showSeverity?:boolean;terminal:'T1'|'T2';rows:readonly CheckpointReading[];now:number;lang:Lang}) {
 const groups=checkpointLayout(terminal,rows),minute=t(lang,'분','min','分','分');
 const host=useRef<HTMLElement>(null),longest=longestCheckpoint(terminal,rows,now);
 const motionKey=JSON.stringify(rows.map(row=>[row.zone,row.observedAt,row.freshness]));
 useEffect(()=>{
  const node=host.current;if(!showSeverity||!node||!window.IntersectionObserver)return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');let visible=false;
  const update=()=>{node.dataset.motion=visible&&!document.hidden&&!preference.matches&&longest.value!==null?'running':'paused';};
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;update();},{threshold:.15});
  observer.observe(node);preference.addEventListener('change',update);document.addEventListener('visibilitychange',update);update();
  return()=>{observer.disconnect();preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
 },[showSeverity,motionKey,longest.value]);
 const locations=longest.keys.slice(0,2).map(key=>terminal==='T1'?`${key[0]} ${key.endsWith('E')?t(lang,'동','E','东','東'):t(lang,'서','W','西','西')}`:key).join(' / ')+(longest.keys.length>2?` +${longest.keys.length-2}`:'');
 const terminalRows=rows.filter(row=>row.terminal===terminal);
 const observed=[...new Set(terminalRows.map(row=>row.observedAt))].filter(at=>Number.isFinite(Date.parse(at))).sort();
 const locale={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang];
 const stamp=(at:string)=>Number.isFinite(Date.parse(at))?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at)):t(lang,'시각 미확인','Time unconfirmed','时间未确认','時刻未確認');
 const wait=(row:CheckpointReading|null)=>{
  const heat:ReturnType<typeof queueHeat>=row?queueHeat(row,now):{level:'neutral',state:'missing'};
  const value=row?displayedQueueMinutes(row):null;
  const shown=heat.state==='closed'?t(lang,'중단','Off','暂停','停止'):value===null?'—':`${value}${row?.waitTimeRaw==='60+'?'+':''}`;
  return {heat,value,shown};
 };
 return <figure ref={host} className="checkpoint-schematic" data-testid="checkpoint-schematic" data-terminal={terminal} data-enhanced={showSeverity||undefined}>
  <figcaption><strong>{terminal}</strong> {t(lang,'출국장 대기','Departure-hall waits','出境厅等候','出国場の待ち時間')}</figcaption>
  {showSeverity&&<p className="checkpoint-longest" data-testid="checkpoint-longest" data-uncertain={longest.uncertain||undefined}>{longest.value===null?t(lang,'비교할 최신 대기 관측 없음','No fresh waits to compare','暂无最新等候可比较','比較できる最新の待ち時間なし'):longest.uncertain?t(lang,'최장 지점 미확정 · 60분 이상 관측 포함','Longest location unconfirmed · includes 60+ min','最长地点未确定 · 含60分钟以上观测','最長地点未確定 · 60分以上の観測あり'):<>{t(lang,'확인된 최장','Longest confirmed','已确认最长','確認済み最長')} <b>{longest.value}{longest.lowerBound?'+':''}{minute}</b> · {locations}</>}</p>}
  <div className="checkpoint-schematic-stage">
   <div className="checkpoint-schematic-drawing">
    {/* eslint-disable-next-line @next/next/no-img-element -- Original responsive Blender render; dimensions reserve space. */}
    <img src="/visuals/airport-queue/checkpoint-base-480.webp" srcSet="/visuals/airport-queue/checkpoint-base-480.webp 480w, /visuals/airport-queue/checkpoint-base-960.webp 960w" sizes="(max-width:600px) calc(100vw - 36px), 640px" width="960" height="400" alt="" loading="lazy" decoding="async"/>
    <svg className="checkpoint-schematic-leaders" viewBox="0 0 960 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
     {LANE_ANCHORS.map(([x,y],index)=><g key={index} data-longest={showSeverity&&longest.keys.includes(groups.flat()[index].key)||undefined}><path d={leaderPath(index)} pathLength="1"/><circle cx={x} cy={y} r="7"/></g>)}
    </svg>
    {showSeverity&&<svg className="checkpoint-walkers" viewBox="0 0 960 400" aria-hidden="true" focusable="false">{[[257,267],[687,267]].map(([x,y],index)=><g key={index} transform={`translate(${x} ${y})`}><g className="checkpoint-walker" style={{animationDelay:`${index*-.8}s`}}><ellipse cy="3" rx="13" ry="4" fill="#7e969b" opacity=".2"/><g className="checkpoint-walker-body"><circle cy="-32" r="7" fill="#c8dfe5"/><path d="M-6-23Q0-27 6-23L8-9H-8Z" fill="#6899ac"/><path d="M-6-20L-11-9M6-20L11-12" stroke="#8bb6c5" strokeWidth="4" strokeLinecap="round"/><path className="checkpoint-walker-leg" d="M-4-10L-6 1"/><path className="checkpoint-walker-leg checkpoint-walker-leg-back" d="M4-10L6 1"/></g></g></g>)}</svg>}
   </div>
   <div className="checkpoint-schematic-readings">{groups.flat().map(slot=>{
    const {heat,value,shown}=wait(slot.row);
    const side=slot.key.endsWith('W')?t(lang,'서','W','西','西'):t(lang,'동','E','东','東');
    const name=terminal==='T1'?`${slot.key.slice(0,1)} ${side}`:slot.key;
    const count=slot.row?.waitingCount;
    const known=typeof count==='number'&&Number.isFinite(count)&&count>=0,n=known?count.toLocaleString(locale):'';
    const people=known
     ?t(lang,`대기 ${n}명`,`Waiting ${n}`,`等候 ${n}人`,`待機 ${n}人`)
     :t(lang,'인원 미제공','Count unavailable','人数未提供','人数未提供');
    // A lane is about 35px wide on a 320px phone: English words longer than that
    // would split mid-word, so the label shows short words and speaks in full.
    const peopleShown=lang==='en'?known?`${n} in line`:'No count':people;
    return <div className="checkpoint-schematic-reading" key={slot.key} data-checkpoint={slot.key} data-longest={showSeverity&&longest.keys.includes(slot.key)||undefined} data-state={heat.state} data-wait-level={heat.level} data-basis={heat.basis} aria-label={`${terminal} ${slot.key} · ${shown} ${value===null?'':minute} · ${people} · ${queueHeatLabel(heat,lang)}`}>
     <span>{name}</span><strong><span>{shown}{heat.state==='zero'&&<sup>*</sup>}</span>{value!==null&&heat.state!=='closed'&&<small>{minute}</small>}</strong>
     <small className="checkpoint-schematic-people">{peopleShown}</small>{showSeverity&&heat.state==='current'&&heat.level==='very-busy'&&<small className="checkpoint-severity">{heat.basis?t(lang,'60분+','60+ min','60分+','60分以上'):queueHeatLabel(heat,lang)}</small>}
    </div>;
   })}</div>
  </div>
  <p className="checkpoint-schematic-time">{t(lang,'관측','Observed','观测','観測')}: {observed.length?observed.length===1?stamp(observed[0]):`${stamp(observed[0])} / ${stamp(observed.at(-1)!)}`:'—'} KST{observed.length>1?` · ${t(lang,'출국장별 시각 다름','Clocks differ by hall','各厅时刻不同','出国場ごとに時刻が異なります')}`:''}</p>
  <p className="checkpoint-schematic-basis">{t(lang,'— 미확인 · *0분은 운영 확인 · 오래된 값은 회색','— unconfirmed · *0 min: check operation · old values are grey','— 未确认 · *0分需确认运营 · 旧值为灰色','— 未確認 · *0分は運営を確認 · 古い値は灰色')}</p>
  {showSeverity&&terminal==='T1'&&<p className="checkpoint-schematic-basis">{t(lang,'T1 색상은 코리테일 분 단위 기준 · 공식 혼잡 등급 아님','T1 colors use KORETAIL minute bands, not official congestion grades.','T1配色采用KORETAIL分钟标准，非官方拥挤等级。','T1の色はKORETAILの分単位基準で、公式混雑等級ではありません。')}</p>}<details className="checkpoint-schematic-details">
   <summary>{t(lang,'대기 인원·시각·출처','People, times and source','等候人数、时刻与来源','待機人数・時刻・出典')}</summary>
   {terminalRows.length?<ul className="checkpoint-observation-list">{terminalRows.map((row,index)=>{
    const {heat,value}=wait(row);
    const raw=row.waitTimeRaw?.trim();
    const detailWait=value!==null?`${value}${raw==='60+'?'+':''}${minute}`:raw||t(lang,'미확인','Unconfirmed','未确认','未確認');
    const people=typeof row.waitingCount==='number'?`${row.waitingCount.toLocaleString(locale,{maximumFractionDigits:0})}${t(lang,'명',' people','人','人')}`:t(lang,'미확인','Unconfirmed','未确认','未確認');
    return <li key={`${row.zone}-${row.observedAt}-${index}`} data-observation={row.zone} data-state={heat.state} data-wait-level={heat.level} data-basis={heat.basis}>
     <div><strong>{friendlyCheckpointName(row.zone,lang)}</strong><span>{detailWait}</span></div>
     <p>{t(lang,'대기 인원','Waiting','等候人数','待機人数')} {people} · <time dateTime={row.observedAt}>{stamp(row.observedAt)} KST</time></p>
     <small>{queueHeatLabel(heat,lang)}</small>
    </li>;
   })}</ul>:<p>{t(lang,'확인된 관측이 없습니다.','No confirmed observations.','暂无已确认观测。','確認できる観測はありません。')}</p>}
   <p>{t(lang,'출처: 인천국제공항공사','Source: Incheon International Airport Corporation','来源：仁川国际机场公社','出典：仁川国際空港公社')} · <a href={CHECKPOINT_SOURCE_URLS[terminal]} target="_blank" rel="noopener noreferrer">{t(lang,'공식 대기 데이터','Official wait data','官方等候数据','公式待ち時間データ')} ↗</a></p>
   <p>{terminal==='T1'?t(lang,'2~5번 출국장 안의 동·서입니다. 항공편의 동·서 구역과 다릅니다. 1·6번은 현재 자료의 확인된 관측 범위 밖입니다.','East/west within halls 2–5 differs from flight zones. Halls 1 and 6 are outside the verified scope of the current data.','2至5号厅内的东、西与航班区域不同。1、6号厅不在当前资料已确认的观测范围内。','2〜5番出国場内の東西で、航空便の区分とは異なります。1・6番は現在の資料で確認できる観測範囲外です。'):t(lang,'1A~2D 출국장을 표시합니다.','Shows halls 1A–2D.','显示1A至2D出境厅。','1A〜2Dの出国場を表示しています。')}</p>
   <p>{t(lang,'위치·인물은 장식용 개념 모형이며, 공식 좌표나 실제 대기 인원을 나타내지 않습니다. 대기 관측은 현재 출국장 정보이며 선택한 날짜의 기록이 아닙니다.','Positions and people are decorative, not official coordinates or observed headcounts. Waits are current observations, not records for the selected date.','位置和人物为装饰性示意，不代表官方坐标或实际等候人数。等候数据为当前观测，并非所选日期的记录。','位置と人物は装飾用の模式図で、公式座標や実際の待機人数を表しません。待ち時間は現在の観測で、選択日の記録ではありません。')}</p>
   {terminal==='T1'&&<p>{t(lang,'색은 분 단위 대기에 따른 KORETAIL 기준이며 공식 T1 혼잡 등급이 아닙니다.','Colors use KORETAIL minute criteria, not official T1 congestion grades.','颜色采用KORETAIL分钟标准，并非T1官方拥挤等级。','色はKORETAILの分単位基準で、T1の公式混雑等級ではありません。')}</p>}
  </details>
 </figure>;
}
