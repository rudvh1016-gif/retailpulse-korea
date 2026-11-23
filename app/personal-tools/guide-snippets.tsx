'use client';

import {useState} from 'react';
import {GUIDE_LANGUAGES, type GuideLanguage, type GuideSnippet, type PersonalCommand} from '../../lib/personal-tools/model';

const languageLabels: Record<GuideLanguage,string> = {ko:'한국어',en:'영어',zh:'중국어',ja:'일본어',other:'기타'};

export function GuideSnippets({items,revision,send}:{items:GuideSnippet[];revision:string;send:(command:PersonalCommand)=>Promise<boolean>}) {
  const [draft,setDraft]=useState<GuideSnippet|null>(null);
  const [original,setOriginal]=useState<GuideSnippet|null>(null);
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [language,setLanguage]=useState<GuideLanguage|''>('');
  const [removal,setRemoval]=useState<{id:string;revision:string}|null>(null);
  const keyword=query.trim().toLowerCase();
  const visible=items.filter(item=>(!language||(item.language??'other')===language)&&
    (!keyword||[item.label,item.body].some(value=>value.toLowerCase().includes(keyword))));
  const edit=(item:GuideSnippet|null)=>{
    setOriginal(item);
    setDraft(item??{id:'',label:'',body:'',language:'other'});
    setRemoval(null);
    setMessage('');
  };
  const save=async()=>{
    if(!draft?.label.trim()||!draft.body.trim())return;
    const latest=items.find(item=>item.id===draft.id);
    if(original&&(latest?.label!==original.label||latest?.body!==original.body||latest?.language!==original.language)){
      setMessage('보관함이 다른 창에서 바뀌었습니다. 입력 내용을 복사한 뒤 최신 문구를 다시 불러오세요.');
      return;
    }
    if(await send({type:'snippet.upsert',snippet:{...draft,id:draft.id||crypto.randomUUID()}})){
      setDraft(null);setOriginal(null);
    }
  };
  const copy=async(item:GuideSnippet)=>{
    try{await navigator.clipboard.writeText(item.body);setMessage('안내 문구를 복사했습니다.');}
    catch{setMessage('자동으로 복사하지 못했습니다. 본문을 선택해 복사해 주세요.');}
  };
  return <div className="pt-inset">
    <h3 data-heading="subsection"><span className="heading-marker" aria-hidden="true"/>고객 안내 문구</h3>
    {items.length>0&&<><label>안내 문구 검색<input type="search" maxLength={80} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <label>표시할 언어<select value={language} onChange={event=>setLanguage(event.target.value as GuideLanguage|'')}>
        <option value="">전체</option>{GUIDE_LANGUAGES.map(value=><option key={value} value={value}>{languageLabels[value]}</option>)}
      </select></label></>}
    {!draft&&<button type="button" onClick={()=>edit(null)}>새 안내 문구</button>}
    {draft&&<form onSubmit={event=>{event.preventDefault();void save();}}>
      <label>문구 제목<input required maxLength={60} value={draft.label} onChange={event=>setDraft({...draft,label:event.target.value})}/></label>
      <label>문구 언어<select value={draft.language??'other'} onChange={event=>setDraft({...draft,language:event.target.value as GuideLanguage})}>
        {GUIDE_LANGUAGES.map(value=><option key={value} value={value}>{languageLabels[value]}</option>)}
      </select></label>
      <label>안내 본문<textarea required maxLength={1000} value={draft.body} onChange={event=>setDraft({...draft,body:event.target.value})}/></label>
      <button type="submit">안내 문구 저장</button><button type="button" onClick={()=>setDraft(null)}>취소</button>
    </form>}
    {items.length>0&&!visible.length&&<p>검색 조건에 맞는 문구가 없습니다.</p>}
    {visible.map(item=><article className="pt-inset" key={item.id}>
      <p><strong>{item.label}</strong>{item.language&&<> · {languageLabels[item.language]}</>}</p>
      <p className="pt-note" lang={item.language==='other'?undefined:item.language}>{item.body}</p>
      <button type="button" onClick={()=>void copy(item)}>복사</button>
      <button type="button" onClick={()=>edit(item)}>수정</button>
      {removal?.id===item.id&&removal.revision===revision?<><button type="button" onClick={async()=>{if(await send({type:'snippet.remove',id:item.id}))setRemoval(null);}}>이 문구 삭제</button>
        <button type="button" onClick={()=>setRemoval(null)}>삭제 취소</button></>:<button type="button" disabled={draft?.id===item.id} onClick={()=>setRemoval({id:item.id,revision})}>삭제</button>}
    </article>)}
    {message&&<p role="status">{message}</p>}
  </div>;
}
