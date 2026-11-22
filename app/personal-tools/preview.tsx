'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {HOUR_CHOICES} from '../../lib/business-preferences';
import {kstDayOf} from '../../lib/kst';
import {buildShiftBriefing} from '../../lib/shift-briefing';
import type {GlanceWeekReference} from '../../lib/glance-week-comparison';
import {captureBriefingSnapshot} from '../../lib/personal-tools/briefing-snapshot';
import {DEPARTURE_WAIT_THRESHOLDS,emptyPersonalState,exportPersonalState,personalSyncPreview,type BriefingSnapshot,type DepartureWaitThreshold,type GuideId,type PersonalCommand,type PersonalState,type ShiftPattern,type SyncSelection} from '../../lib/personal-tools/model';
import {openRemotePersonalStore} from '../../lib/personal-tools/remote-storage';
import {exportShiftCalendar} from '../../lib/personal-tools/calendar-export';
import {openPersonalStore,type PersonalStore} from '../../lib/personal-tools/storage';
import {useFlights} from '../flights-client';
import {usePreparedMonth} from '../use-prepared-month';
import {DepartureAlert} from './departure-alert';
import {GuideSnippets} from './guide-snippets';

const guides:Record<GuideId,{label:string;href:string}>={
  allowance:{label:'도착국 반입 면세한도',href:'/ko/airport-prepare#arrival-allowances'},
  facilities:{label:'공항 편의시설',href:'/ko/airport#airport-facilities-title'},
  routes:{label:'국가별 출발 구역',href:'/ko/airport-countries'},
};
const selectionLabels:Record<keyof SyncSelection,string>={calendar:'근무 달력',journal:'근무 메모',favorites:'가이드 즐겨찾기',checklists:'체크리스트',notifications:'알림 설정'};
const initialPattern:ShiftPattern={id:'',label:'',terminal:'T2',side:null,open:'07:00',close:'15:00'};
const uid=()=>crypto.randomUUID();
const explain=(error:unknown)=>{
  const code=error instanceof Error?error.message:'UNKNOWN_ERROR';
  return code==='CONFLICT'?'다른 창에서 자료가 바뀌었습니다. 최신 자료를 다시 읽은 후 확인해 주세요.':`저장하지 못했습니다 (${code}). 입력 내용은 그대로 두었습니다.`;
};
export function Snapshot({value}:{value:BriefingSnapshot}) {
  return <dl className="pt-metrics"><dt>선택</dt><dd>{value.day} · {value.terminal} · {value.side??'전체'} · {value.open}–{value.close}</dd>
    <dt>출발편</dt><dd>{value.total===null?'전체 수치 확인 불가':`${value.total}편`}{value.total===null&&value.confirmed!==null?` · 확인된 기록 ${value.confirmed}편`:''}</dd>
    <dt>상태</dt><dd>{value.status} {value.reason??''}{value.provisional?' · 잠정':''}</dd>
    <dt>자료 기준</dt><dd>{value.basis??'확인되지 않음'}</dd>
    <dt>원자료 수집 / 확인 시각</dt><dd>{value.retrievedAt??'없음'} / {value.checkedAt??'없음'}</dd>
    <dt>확인된 목적지 상위 최대 6곳</dt><dd>{value.topDestinations?.slice(0,6).map(row=>`${row.country} ${row.flights}편`).join(' · ')||'확인된 목록 없음'} <small>(승객 국적 아님. 나머지 또는 미확인 목적지는 빠질 수 있어 이 목록의 합계가 전체 출발편 수는 아닙니다.)</small></dd>
  </dl>;
}
function Briefing({date,pattern,body,busy,onSave}:{date:string;pattern:ShiftPattern;body:string;busy:boolean;onSave:(snapshot:BriefingSnapshot)=>Promise<boolean>}) {
  const loaded=useFlights(date,pattern.terminal);
  const payload=loaded?.status==='OK'?loaded.payload:loaded?.status==='FAILED'?null:undefined;
  const key=`${date}:${payload?.retrievedAt??''}`;
  const reference=usePreparedMonth<{status:string;month:string;data:GlanceWeekReference|null}>(key,`/api/live/glance-week-reference?date=${encodeURIComponent(date)}`,payload?date.slice(0,7):'',key);
  const [now,setNow]=useState(()=>new Date().toISOString());
  useEffect(()=>{const tick=()=>setNow(new Date().toISOString());const initial=setTimeout(tick,0),timer=setInterval(tick,60_000);return()=>{clearTimeout(initial);clearInterval(timer);};},[payload?.retrievedAt,reference.reply?.data]);
  const capturedAt=now;
  const briefing=buildShiftBriefing({day:date,nowIso:capturedAt,terminal:pattern.terminal,side:pattern.side,hours:pattern,flights:payload,history:[],weekReference:reference.reply?.data});
  const snapshot=captureBriefingSnapshot(briefing,pattern,capturedAt);
  return <div className="pt-inset"><h3 data-heading="subsection"><span className="heading-marker" aria-hidden="true"/>현재 브리핑 저장 미리보기</h3><p>저장된 항공편 자료를 읽습니다. 비교·예측은 포함하지 않으며 아래 값만 메모에 고정합니다.</p>
    <Snapshot value={snapshot}/><button disabled={busy||!body.trim()} onClick={()=>void onSave({...snapshot,capturedAt:new Date().toISOString()})}>브리핑과 함께 메모 저장</button>
    <p>부족한 자료는 0으로 바꾸지 않습니다. 자정을 넘는 근무의 집계는 아직 지원하지 않습니다.</p></div>;
}

function authenticationLost(error:unknown){return error instanceof Error&&['UNAUTHENTICATED','ACCOUNT_CHANGED'].includes(error.message);}
export default function PersonalToolsPreview({accountId,onAccountInvalid,alertsPaused=false}:{accountId?:string;onAccountInvalid?:()=>void;alertsPaused?:boolean}) {
  const store=useRef<PersonalStore|null>(null),live=useRef(false),lock=useRef(false);
  const [privateHidden,setPrivateHidden]=useState(false);
  const editorBases=useRef({pattern:'',template:'',note:''});
  const [state,setState]=useState<PersonalState>(emptyPersonalState),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [pattern,setPattern]=useState<ShiftPattern>(initialPattern),[date,setDate]=useState(()=>kstDayOf(new Date().toISOString())),[assignmentPattern,setAssignmentPattern]=useState('');
  const [body,setBody]=useState(''),[editingNote,setEditingNote]=useState(''),[briefingDate,setBriefingDate]=useState<string|null>(null);
  const [templateId,setTemplateId]=useState(''),[templateLabel,setTemplateLabel]=useState(''),[templateLines,setTemplateLines]=useState(''),[runTemplate,setRunTemplate]=useState('');
  const [guideEditorKey,setGuideEditorKey]=useState(0);
  const [backup,setBackup]=useState(''),[replaceConfirmed,setReplaceConfirmed]=useState(false),[deletePhrase,setDeletePhrase]=useState('');
  const resetEditors=useCallback(()=>{
    editorBases.current={pattern:'',template:'',note:''};
    setPattern(initialPattern);setAssignmentPattern('');setDate(kstDayOf(new Date().toISOString()));
    setBody('');setEditingNote('');setBriefingDate(null);setTemplateId('');setTemplateLabel('');setTemplateLines('');setRunTemplate('');
    setBackup('');setReplaceConfirmed(false);setDeletePhrase('');setGuideEditorKey(key=>key+1);
  },[]);
  const hidePrivate=useCallback(()=>{store.current?.close();store.current=null;setReady(false);setState(emptyPersonalState());resetEditors();setPrivateHidden(true);onAccountInvalid?.();},[onAccountInvalid,resetEditors]);
  useEffect(()=>{
    live.current=true;let owned:PersonalStore|null=null,cancelled=false;
    void (accountId?openRemotePersonalStore(accountId):openPersonalStore()).then(async opened=>{owned=opened;if(cancelled){opened.close();return;}const value=await opened.read();if(cancelled){opened.close();return;}store.current=opened;setState(value);setReady(true);}).catch(error=>{if(!cancelled){if(authenticationLost(error)){hidePrivate();return;}setMessage(`${accountId?'계정':'기기'} 저장소를 열지 못했습니다 (${error instanceof Error?error.message:'UNKNOWN_ERROR'}). 기존 자료를 초기화하지 않습니다.`);}});
    return()=>{cancelled=true;live.current=false;store.current=null;owned?.close();};
  },[accountId,hidePrivate]);
  async function perform(action:(saved:PersonalStore)=>Promise<PersonalState>,success=accountId?'계정에 저장했습니다.':'이 기기에 저장했습니다.'):Promise<boolean>{
    if(lock.current||!store.current||!ready)return false;
    lock.current=true;setBusy(true);setMessage('');
    try{const next=await action(store.current);if(live.current){
      // A reread or committed edit may change what a previous destructive
      // confirmation covered. Keep drafts, but require renewed confirmation.
      if(next.revision!==state.revision){setReplaceConfirmed(false);setDeletePhrase('');}
      setState(next);setMessage(success);}return live.current;}
    catch(error){if(live.current){if(authenticationLost(error))hidePrivate();else setMessage(explain(error));}return false;}
    finally{lock.current=false;if(live.current)setBusy(false);}
  }
  const send=(command:PersonalCommand)=>perform(saved=>saved.dispatch(command,state.revision));
  function unchangedEditor(kind:keyof typeof editorBases.current,current:unknown){
    // Rereading advances the screen revision, not the base of an open draft.
    // Storage CAS still protects changes occurring after this comparison.
    if(!current||JSON.stringify(current)!==editorBases.current[kind]){
      setMessage('수정 중인 항목이 다른 창에서 바뀌거나 삭제되었습니다. 입력은 보존했습니다. 복사해 둔 뒤 수정 취소하고 최신 항목을 다시 선택해 주세요.');return false;
    }
    return true;
  }
  async function removePattern(id:string){
    if(!await send({type:'pattern.remove',id}))return;
    setPattern(current=>current.id===id?initialPattern:current);
    setAssignmentPattern(current=>current===id?'':current);
  }
  async function removeTemplate(id:string){
    if(!await send({type:'template.remove',id}))return;
    if(templateId===id){setTemplateId('');setTemplateLabel('');setTemplateLines('');}
    setRunTemplate(current=>current===id?'':current);
  }
  const selectedPattern=state.patterns.find(item=>item.id===state.assignments.find(item=>item.date===date)?.patternId);
  async function saveNote(snapshot:BriefingSnapshot|null){const saved=await send({type:'note.add',id:uid(),date,body,snapshot});if(saved)setBody('');return saved;}
  async function downloadCalendar(){
    if(lock.current||!store.current||!ready)return;lock.current=true;setBusy(true);
    try{
      const current=await store.current.read();if(!live.current)return;
      const url=URL.createObjectURL(new Blob([exportShiftCalendar(current)],{type:'text/calendar;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='koretail-shifts.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage('근무 달력 파일을 만들었습니다. 달력 앱에서 직접 가져오세요. 자동 동기화나 알림 전달을 확인한 것은 아닙니다.');
    }catch(error){if(live.current){if(authenticationLost(error))hidePrivate();else setMessage(explain(error));}}
    finally{lock.current=false;if(live.current)setBusy(false);}
  }
  async function download(){
    if(lock.current||!store.current||!ready)return;
    lock.current=true;setBusy(true);
    try{
      // Export the committed store, not this tab's potentially stale form state.
      // Do not advance the editor revision without an explicit reread.
      const current=await store.current.read();if(!live.current)return;
      const url=URL.createObjectURL(new Blob([exportPersonalState(current)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`koretail-personal-${date}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('최신 저장 자료의 백업 다운로드를 요청했습니다. 파일을 안전한 곳에 보관하세요.');
    }catch(error){if(live.current){if(authenticationLost(error))hidePrivate();else setMessage(explain(error));}}
    finally{lock.current=false;if(live.current)setBusy(false);}
  }
  if(privateHidden)return <p role="status">계정이 바뀌었거나 로그인이 끝나 개인 자료를 숨겼습니다. <Link href="/ko/account">계정 다시 확인</Link></p>;
  const Shell=accountId?'section':'main';
  return <Shell className="pt-shell"><link rel="stylesheet" href="/personal-tools-preview.css"/><header><Link href="/ko" prefetch={false}>← 로그인 없이 KORETAIL 이용</Link><p className="pt-eyebrow">{accountId?'GOOGLE ACCOUNT · 개인 저장소':'LOCAL PREVIEW · 운영 전 검증'}</p>{accountId?<h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>내 개인 도구</h2>:<h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>개인 도구 준비 화면</h1>}
    {accountId?<p>이 화면에서 저장한 내용은 현재 Google 계정의 서버 개인 저장소에 보관됩니다. 기존 기기 자료는 자동으로 올리지 않습니다. 복원에 입력하는 백업은 전체 내용이 서버로 전송됩니다. 공용 기기에서는 사용 후 로그아웃하세요.</p>:<>
    <p>이 기기에만 저장됩니다. 같은 브라우저를 사용하는 사람은 내용을 볼 수 있습니다. 브라우저 자료를 지우거나 기기가 없어지면 복구할 수 없으므로 백업을 보관하세요.</p>
    <p>새로 재구성한 개발용 준비 화면입니다. 이전 작업본의 동일 복구본이 아니며 공개 운영에 연결되지 않았습니다.</p>
    <button disabled>Google 로그인 준비 중</button><p>계정, 실제 동기화, 알림 발송: <strong>NOT_IMPLEMENTED</strong>. 로그인 없이 공개 서비스는 계속 이용할 수 있습니다.</p></>}</header>
    <p role="status" aria-live="polite">{message||(!ready?(accountId?'계정 저장소 확인 중…':'기기 저장소 확인 중…'):(accountId?'현재 계정의 개인 자료입니다.':'메모와 패턴 이름은 서버로 전송하지 않습니다. 공개 브리핑을 읽을 때 선택 날짜만 조회에 사용합니다.'))}</p>
    <button disabled={!ready||busy} onClick={()=>void perform(saved=>saved.read(),`${accountId?'최신 계정':'최신 기기'} 자료를 읽었습니다. 입력은 유지했습니다. 자료가 바뀌었다면 삭제·교체를 다시 확인해 주세요.`)}>최신 자료 다시 읽기</button>
    <fieldset disabled={!ready||busy} className="pt-all"><legend className="pt-sr">개인 도구</legend>
      <section><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>1. 근무 패턴과 달력</h2><form onSubmit={event=>{event.preventDefault();if(pattern.id&&!unchangedEditor('pattern',state.patterns.find(item=>item.id===pattern.id)))return;void send({type:'pattern.upsert',pattern:{...pattern,id:pattern.id||uid()}}).then(ok=>{if(ok)setPattern(initialPattern);});}}>
        <label>패턴 이름<input value={pattern.label} maxLength={60} required onChange={event=>setPattern({...pattern,label:event.target.value})}/></label>
        <label>터미널<select value={pattern.terminal} onChange={event=>setPattern({...pattern,terminal:event.target.value as 'T1'|'T2'})}><option>T1</option><option>T2</option></select></label>
        <label>구역<select value={pattern.side??''} onChange={event=>setPattern({...pattern,side:(event.target.value||null) as ShiftPattern['side']})}><option value="">전체</option><option value="EAST">동편</option><option value="WEST">서편</option></select></label>
        <label>시작<select value={pattern.open} onChange={event=>setPattern({...pattern,open:event.target.value})}>{HOUR_CHOICES.map(hour=><option key={hour}>{hour}</option>)}</select></label>
        <label>종료<select value={pattern.close} onChange={event=>setPattern({...pattern,close:event.target.value})}>{HOUR_CHOICES.map(hour=><option key={hour}>{hour}</option>)}</select></label>
        <button type="submit">{pattern.id?'패턴 수정':'패턴 추가'}</button>{pattern.id&&<button type="button" onClick={()=>setPattern(initialPattern)}>수정 취소</button>}</form>
        <p>시작과 종료가 같으면 24시간입니다. 야간 패턴은 저장할 수 있지만 자정 이후 항공편 합산은 지원하지 않습니다.</p>
        <ul>{state.patterns.map(item=><li key={item.id}>{item.label} · {item.terminal} · {item.open}–{item.close} <button onClick={()=>{editorBases.current.pattern=JSON.stringify(item);setPattern({...item});}}>수정</button> <button onClick={()=>void removePattern(item.id)}>삭제</button></li>)}</ul>
        <form onSubmit={event=>{event.preventDefault();void send({type:'assignment.set',date,patternId:assignmentPattern});}}><label>근무 날짜<input type="date" value={date} required onChange={event=>setDate(event.target.value)}/></label><label>배정할 패턴<select required value={assignmentPattern} onChange={event=>setAssignmentPattern(event.target.value)}><option value="">선택</option>{state.patterns.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button>날짜에 배정</button></form>
        <ul>{state.assignments.map(item=><li key={item.date}><button onClick={()=>setDate(item.date)}>{item.date}</button> · {state.patterns.find(row=>row.id===item.patternId)?.label} <button onClick={()=>void send({type:'assignment.remove',date:item.date})}>배정 해제</button></li>)}</ul>
      </section>
      <section><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>2. 근무 메모</h2><p>선택 날짜 {date}. 수정은 글에만 반영되며 저장한 브리핑은 갱신되지 않습니다.</p><label>메모<textarea value={body} maxLength={2000} onChange={event=>setBody(event.target.value)}/></label>
        {editingNote?<><button disabled={!body.trim()} onClick={()=>{if(!unchangedEditor('note',state.notes.find(item=>item.id===editingNote)))return;void send({type:'note.update',id:editingNote,body}).then(ok=>{if(ok){setEditingNote('');setBody('');}});}}>메모 수정 저장</button><button onClick={()=>{setEditingNote('');setBody('');}}>수정 취소</button></>:<><button disabled={!body.trim()} onClick={()=>void saveNote(null)}>브리핑 없이 메모 저장</button>{selectedPattern&&ready&&<><p>공개 브리핑을 읽으면 선택 날짜를 KORETAIL의 기존 공개 조회 API로 보냅니다. 메모와 패턴 이름은 보내지 않습니다.</p><button onClick={()=>setBriefingDate(date)}>선택 날짜의 공개 브리핑 읽기</button></>}{selectedPattern&&ready&&briefingDate===date&&<Briefing key={`${date}:${selectedPattern.id}`} date={date} pattern={selectedPattern} body={body} busy={busy} onSave={saveNote}/>}</>}
        {state.notes.map(note=><article key={note.id} className="pt-inset"><h3 data-heading="subsection"><span className="heading-marker" aria-hidden="true"/>{note.date}</h3><p className="pt-note">{note.body}</p>{note.snapshot?<details><summary>저장 당시 브리핑 · {note.snapshot.capturedAt}</summary><Snapshot value={note.snapshot}/></details>:<p>브리핑 없이 저장한 메모</p>}<button onClick={()=>{editorBases.current.note=JSON.stringify(note);setEditingNote(note.id);setBody(note.body);}}>글 수정</button> <button onClick={()=>void send({type:'note.remove',id:note.id}).then(ok=>{if(ok&&editingNote===note.id){setEditingNote('');setBody('');}})}>메모 삭제</button></article>)}
      </section>
      <section><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{accountId?'3. 고객 안내 문구 보관함':'3. 가이드 즐겨찾기'}</h2><p>가이드를 직접 확인한 날짜를 함께 저장할 수 있습니다.</p>
        {accountId&&<GuideSnippets key={guideEditorKey} items={state.guideSnippets??[]} send={send}/>}
        {(Object.keys(guides) as GuideId[]).filter(id=>!state.favorites.some(item=>item.guideId===id)).map(id=><button key={id} onClick={()=>void send({type:'favorites.set',favorites:[...state.favorites,{guideId:id,checkedDate:null}]})}>{guides[id].label} 추가</button>)}
        <ol>{state.favorites.map((item,index)=><li key={item.guideId}><a href={guides[item.guideId].href}>{guides[item.guideId].label}</a><label>직접 확인한 날짜<input type="date" value={item.checkedDate??''} onChange={event=>void send({type:'favorites.set',favorites:state.favorites.map(row=>row.guideId===item.guideId?{...row,checkedDate:event.target.value||null}:row)})}/></label><button disabled={index===0} onClick={()=>{const next=[...state.favorites];[next[index-1],next[index]]=[next[index],next[index-1]];void send({type:'favorites.set',favorites:next});}}>위로</button> <button disabled={index===state.favorites.length-1} onClick={()=>{const next=[...state.favorites];[next[index+1],next[index]]=[next[index],next[index+1]];void send({type:'favorites.set',favorites:next});}}>아래로</button> <button onClick={()=>void send({type:'favorites.set',favorites:state.favorites.filter(row=>row.guideId!==item.guideId)})}>즐겨찾기 삭제</button></li>)}</ol>
      </section>
      <section><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>4. 근무 체크리스트</h2><form onSubmit={event=>{event.preventDefault();const old=state.templates.find(item=>item.id===templateId);if(templateId&&!unchangedEditor('template',old))return;const lines=templateLines.split('\n').map(line=>line.trim()).filter(Boolean);void send({type:'template.upsert',template:{id:templateId||uid(),label:templateLabel,items:lines.map((text,index)=>({id:old?.items[index]?.id??uid(),text}))}}).then(ok=>{if(ok){setTemplateId('');setTemplateLabel('');setTemplateLines('');}});}}><label>템플릿 이름<input value={templateLabel} maxLength={60} required onChange={event=>setTemplateLabel(event.target.value)}/></label><label>항목 (한 줄에 하나, 최대 64개)<textarea value={templateLines} maxLength={10304} required onChange={event=>setTemplateLines(event.target.value)}/></label><button>{templateId?'템플릿 수정':'템플릿 추가'}</button>{templateId&&<button type="button" onClick={()=>{setTemplateId('');setTemplateLabel('');setTemplateLines('');}}>수정 취소</button>}</form>
        <ul>{state.templates.map(item=><li key={item.id}>{item.label}<button onClick={()=>{editorBases.current.template=JSON.stringify(item);setTemplateId(item.id);setTemplateLabel(item.label);setTemplateLines(item.items.map(row=>row.text).join('\n'));}}>수정</button><button onClick={()=>void removeTemplate(item.id)}>템플릿 삭제</button></li>)}</ul>
        <label>시작할 템플릿<select value={runTemplate} onChange={event=>setRunTemplate(event.target.value)}><option value="">선택</option>{state.templates.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button disabled={!selectedPattern||!runTemplate} onClick={()=>void send({type:'run.start',id:uid(),date,templateId:runTemplate})}>{date} 체크리스트 시작</button><p>근무가 배정된 날짜만 시작할 수 있습니다. 시작 당시 패턴과 항목을 고정합니다.</p>
        {state.runs.map(run=><article key={run.id} className="pt-inset"><h3 data-heading="subsection"><span className="heading-marker" aria-hidden="true"/>{run.date} · {run.templateLabel}</h3><p>{run.pattern.label} · {run.pattern.open}–{run.pattern.close}</p>{run.items.map(item=><label key={item.id} className="pt-check"><input type="checkbox" checked={item.done} onChange={event=>void send({type:'run.toggle',id:run.id,itemId:item.id,done:event.target.checked})}/>{item.text}</label>)}<button onClick={()=>void send({type:'run.remove',id:run.id})}>실행 기록 삭제</button></article>)}
      </section>
      <section><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>5. 알림 선택 준비</h2><p>{accountId?'선택값은 계정에 저장됩니다.':'선택값만 이 기기에 저장됩니다.'} 근무 전 알림은 달력 파일을 가져와 사용할 수 있습니다. 브리핑·가이드 변경 알림 발송은 NOT_IMPLEMENTED입니다.</p><label>근무 전 알림<select value={state.notificationPreferences.beforeShiftMinutes} onChange={event=>void send({type:'notifications.set',preferences:{...state.notificationPreferences,beforeShiftMinutes:Number(event.target.value) as 0|15|30|60}})}>{[0,15,30,60].map(value=><option key={value} value={value}>{value?`${value}분 전`:'끄기'}</option>)}</select></label>
        {accountId&&<><label>출국장 대기시간 알림<select value={state.notificationPreferences.departureWaitMinutes??0} disabled={busy} onChange={event=>void send({type:'notifications.set',preferences:{...state.notificationPreferences,departureWaitMinutes:Number(event.target.value) as DepartureWaitThreshold}})}>
          {DEPARTURE_WAIT_THRESHOLDS.map(value=><option key={value} value={value}>{value?`${value}분 이상`:'끄기'}</option>)}
        </select></label><DepartureAlert state={state} accountId={accountId} paused={alertsPaused}/></>}
        <label className="pt-check"><input type="checkbox" checked={state.notificationPreferences.briefingChanges} onChange={event=>void send({type:'notifications.set',preferences:{...state.notificationPreferences,briefingChanges:event.target.checked}})}/>브리핑 변경</label><label className="pt-check"><input type="checkbox" checked={state.notificationPreferences.guideChanges} onChange={event=>void send({type:'notifications.set',preferences:{...state.notificationPreferences,guideChanges:event.target.checked}})}/>가이드 변경</label>
        <button disabled={!state.assignments.length} onClick={()=>void downloadCalendar()}>근무 달력과 알림 파일 다운로드</button><p>파일에는 근무 이름과 시간이 포함됩니다. 가져올 캘린더의 공개 범위를 확인하세요. 직접 달력 앱에 가져오세요. 이후 변경은 자동 반영되지 않으며 실제 알림 전달은 달력 앱 설정에 달려 있습니다.</p>
      </section>
      {!accountId&&<section><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>계정 연결 전 자료 선택 검토</h2><p>모든 항목은 기본 선택 해제입니다. 체크해도 전송되지 않습니다. 체크리스트는 근무 달력도 선택해야 합니다.</p>{(Object.keys(selectionLabels) as (keyof SyncSelection)[]).map(key=><label key={key} className="pt-check"><input type="checkbox" checked={state.syncSelection[key]} disabled={key==='checklists'&&!state.syncSelection.calendar||key==='calendar'&&state.syncSelection.checklists} onChange={event=>void send({type:'sync.set',selection:{...state.syncSelection,[key]:event.target.checked}})}/>{selectionLabels[key]}</label>)}<details><summary>선택 자료의 로컬 검토 (전송 없음)</summary><pre>{JSON.stringify(personalSyncPreview(state),null,2)}</pre></details></section>}
      <section><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>백업 · 복원 · 전체 삭제</h2><p>백업에는 메모와 근무 정보가 들어 있습니다. 실제 동기화가 아니며 본인이 안전하게 보관해야 합니다.</p><button onClick={()=>void download()}>JSON 백업 다운로드</button><label>복원할 백업 JSON<textarea value={backup} maxLength={262144} onChange={event=>{setBackup(event.target.value);setReplaceConfirmed(false);}}/></label><label className="pt-check"><input type="checkbox" checked={replaceConfirmed} onChange={event=>setReplaceConfirmed(event.target.checked)}/>현재 개인 도구 자료를 백업 내용으로 교체하는 데 동의합니다.</label><button disabled={!backup||!replaceConfirmed} onClick={()=>void perform(saved=>saved.restore(backup,state.revision),'백업으로 교체했습니다. 다른 서비스의 저장 자료는 변경하지 않았습니다.').then(ok=>{if(ok)resetEditors();})}>백업으로 교체</button>
        <label>전체 삭제하려면 DELETE PERSONAL TOOLS 입력<input value={deletePhrase} onChange={event=>setDeletePhrase(event.target.value)} autoComplete="off"/></label><button disabled={deletePhrase!=='DELETE PERSONAL TOOLS'} onClick={()=>void perform(saved=>saved.clear(state.revision,deletePhrase),'이 개인 도구의 자료를 삭제했습니다. 다른 저장소와 다운로드한 백업은 변경하지 않았습니다.').then(ok=>{if(ok)resetEditors();})}>개인 도구 전체 삭제</button>
      </section>
    </fieldset>
  </Shell>;
}
