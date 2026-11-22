'use client';

import {useState} from 'react';
import type {GuideSnippet,PersonalCommand} from '../../lib/personal-tools/model';

export function GuideSnippets({items,send}:{items:GuideSnippet[];send:(command:PersonalCommand)=>Promise<boolean>}) {
  const [draft,setDraft]=useState<GuideSnippet|null>(null);
  const [original,setOriginal]=useState<GuideSnippet|null>(null);
  const [message,setMessage]=useState('');
  const edit=(item:GuideSnippet|null)=>{
    setOriginal(item);
    setDraft(item??{id:'',label:'',body:''});
    setMessage('');
  };
  const save=async()=>{
    if(!draft?.label.trim()||!draft.body.trim())return;
    const latest=items.find(item=>item.id===draft.id);
    if(original&&(latest?.label!==original.label||latest?.body!==original.body)){
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
    {!draft&&<button type="button" onClick={()=>edit(null)}>새 안내 문구</button>}
    {draft&&<form onSubmit={event=>{event.preventDefault();void save();}}>
      <label>문구 제목<input required maxLength={60} value={draft.label} onChange={event=>setDraft({...draft,label:event.target.value})}/></label>
      <label>안내 본문<textarea required maxLength={1000} value={draft.body} onChange={event=>setDraft({...draft,body:event.target.value})}/></label>
      <button type="submit">안내 문구 저장</button><button type="button" onClick={()=>setDraft(null)}>취소</button>
    </form>}
    {items.map(item=><article className="pt-inset" key={item.id}>
      <p><strong>{item.label}</strong></p><p className="pt-note">{item.body}</p>
      <button type="button" onClick={()=>void copy(item)}>복사</button>
      <button type="button" onClick={()=>edit(item)}>수정</button>
      <button type="button" disabled={draft?.id===item.id} onClick={()=>void send({type:'snippet.remove',id:item.id})}>삭제</button>
    </article>)}
    {message&&<p role="status">{message}</p>}
  </div>;
}
