import type {Lang} from './retailpulse-data';
import {CHECKPOINT_SOURCE_URLS,checkpointLayout} from '../lib/airport-checkpoint-layout';
import {queueHeat,queueHeatLabel,type QueueHeatReading} from '../lib/airport-queue-heat';
import {displayedQueueMinutes} from '../lib/airport-queue-representatives';
import {friendlyCheckpointName} from '../lib/airport-today-summary';
import './airport-checkpoint-schematic.css';

const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
type CheckpointReading=QueueHeatReading & {waitingCount?:number|null};

export function AirportCheckpointSchematic({terminal,rows,now,lang}:{terminal:'T1'|'T2';rows:readonly CheckpointReading[];now:number;lang:Lang}) {
 const groups=checkpointLayout(terminal,rows),minute=t(lang,'분','min','分','分');
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
 return <figure className="checkpoint-schematic" data-testid="checkpoint-schematic" data-terminal={terminal}>
  <figcaption><strong>{terminal}</strong> {t(lang,'출국장 대기','Departure-hall waits','出境厅等候','出国場の待ち時間')}<small>{t(lang,'개념 모형 · 인물은 장식','Concept model · decorative people','概念模型 · 人物为装饰','模式図・人物は装飾')}</small></figcaption>
  <div className="checkpoint-schematic-stage">
   {/* eslint-disable-next-line @next/next/no-img-element -- Original responsive Blender render; dimensions reserve space. */}
   <img src="/visuals/airport-queue/checkpoint-base-480.webp" srcSet="/visuals/airport-queue/checkpoint-base-480.webp 480w, /visuals/airport-queue/checkpoint-base-960.webp 960w" sizes="(max-width:600px) calc(100vw - 36px), 640px" width="960" height="400" alt="" loading="lazy" decoding="async"/>
   <div className="checkpoint-schematic-groups">{groups.map((group,index)=><div className="checkpoint-schematic-group" key={index}>
    {terminal==='T1'&&<span className="checkpoint-group-name">{group[0].key.slice(0,1)}</span>}
    <div className="checkpoint-schematic-pair">{group.map(slot=>{
     const {heat,value,shown}=wait(slot.row);
     const name=terminal==='T1'?slot.key.endsWith('W')?t(lang,'서','W','西','西'):t(lang,'동','E','东','東'):slot.key;
     const count=slot.row?.waitingCount;
     const people=typeof count==='number'&&Number.isFinite(count)&&count>=0
      ?t(lang,`대기 ${count.toLocaleString(locale)}명`,`Waiting ${count.toLocaleString(locale)}`,`等候 ${count.toLocaleString(locale)}人`,`待機 ${count.toLocaleString(locale)}人`)
      :t(lang,'인원 미제공','Count unavailable','人数未提供','人数未提供');
     return <div className="checkpoint-schematic-reading" key={slot.key} data-checkpoint={slot.key} data-state={heat.state} data-wait-level={heat.level} data-basis={heat.basis} aria-label={`${terminal} ${slot.key} · ${shown} ${value===null?'':minute} · ${people} · ${queueHeatLabel(heat,lang)}`}>
      <span>{name}</span><strong>{shown}{value!==null&&heat.state!=='closed'&&<small>{minute}</small>}{heat.state==='zero'&&<sup>*</sup>}</strong>
      <small className="checkpoint-schematic-people">{people}</small>
     </div>;
    })}</div>
   </div>)}</div>
  </div>
  <p className="checkpoint-schematic-time">{t(lang,'관측','Observed','观测','観測')}: {observed.length?observed.length===1?stamp(observed[0]):`${stamp(observed[0])} / ${stamp(observed.at(-1)!)}`:'—'} KST{observed.length>1?` · ${t(lang,'출국장별 시각 다름','Clocks differ by hall','各厅时刻不同','出国場ごとに時刻が異なります')}`:''}</p>
  <p className="checkpoint-schematic-basis">{t(lang,'— 미확인 · *0분은 운영 확인 · 오래된 값은 회색','— unconfirmed · *0 min: check operation · old values are grey','— 未确认 · *0分需确认运营 · 旧值为灰色','— 未確認 · *0分は運営を確認 · 古い値は灰色')}</p>
  <details className="checkpoint-schematic-details">
   <summary>{t(lang,'대기 인원·시각·출처','People, times and source','等候人数、时刻与来源','待機人数・時刻・出典')}</summary>
   {terminalRows.length?<ul className="checkpoint-observation-list">{terminalRows.map((row,index)=>{
    const {heat,value}=wait(row);
    const raw=row.waitTimeRaw?.trim();
    const detailWait=value!==null?`${value}${raw==='60+'?'+':''}${minute}`:raw||t(lang,'미확인','Unconfirmed','未确认','未確認');
    const people=typeof row.waitingCount==='number'?`${row.waitingCount.toLocaleString(locale)}${t(lang,'명',' people','人','人')}`:t(lang,'미확인','Unconfirmed','未确认','未確認');
    return <li key={`${row.zone}-${row.observedAt}-${index}`} data-observation={row.zone} data-state={heat.state} data-wait-level={heat.level} data-basis={heat.basis}>
     <div><strong>{friendlyCheckpointName(row.zone,lang)}</strong><span>{detailWait}</span></div>
     <p>{t(lang,'대기 인원','Waiting','等候人数','待機人数')} {people} · <time dateTime={row.observedAt}>{stamp(row.observedAt)} KST</time></p>
     <small>{queueHeatLabel(heat,lang)}</small>
    </li>;
   })}</ul>:<p>{t(lang,'확인된 관측이 없습니다.','No confirmed observations.','暂无已确认观测。','確認できる観測はありません。')}</p>}
   <p>{t(lang,'출처: 인천국제공항공사','Source: Incheon International Airport Corporation','来源：仁川国际机场公社','出典：仁川国際空港公社')} · <a href={CHECKPOINT_SOURCE_URLS[terminal]} target="_blank" rel="noopener noreferrer">{t(lang,'공식 대기 데이터','Official wait data','官方等候数据','公式待ち時間データ')} ↗</a></p>
   <p>{terminal==='T1'?t(lang,'2~5번 출국장 안의 동·서입니다. 항공편의 동·서 구역과 다릅니다. 1·6번은 이 API의 확인된 관측 범위 밖입니다.','East/west within halls 2–5 differs from flight zones. Halls 1 and 6 are outside this API’s verified observation scope.','2至5号厅内的东、西与航班区域不同。1、6号厅不在此API已确认观测范围内。','2〜5番出国場内の東西で、航空便の区分とは異なります。1・6番はこのAPIの確認済み観測範囲外です。'):t(lang,'1A~2D 출국장을 표시합니다.','Shows halls 1A–2D.','显示1A至2D出境厅。','1A〜2Dの出国場を表示しています。')}</p>
   <p>{t(lang,'위치·인물은 장식용 개념 모형이며, 공식 좌표나 실제 대기 인원을 나타내지 않습니다. 대기 관측은 현재 출국장 정보이며 선택한 날짜의 기록이 아닙니다.','Positions and people are decorative, not official coordinates or observed headcounts. Waits are current observations, not records for the selected date.','位置和人物为装饰性示意，不代表官方坐标或实际等候人数。等候数据为当前观测，并非所选日期的记录。','位置と人物は装飾用の模式図で、公式座標や実際の待機人数を表しません。待ち時間は現在の観測で、選択日の記録ではありません。')}</p>
   {terminal==='T1'&&<p>{t(lang,'색은 분 단위 대기에 따른 KORETAIL 기준이며 공식 T1 혼잡 등급이 아닙니다.','Colors use KORETAIL minute criteria, not official T1 congestion grades.','颜色采用KORETAIL分钟标准，并非T1官方拥挤等级。','色はKORETAILの分単位基準で、T1の公式混雑等級ではありません。')}</p>}
  </details>
 </figure>;
}
