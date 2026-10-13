'use client';
import {useLayoutEffect,useRef,type RefObject} from 'react';
import {reducedMotion} from '../lib/motion';

/** A finite response to a choice. The DOM always contains the final values. */
export function animateChoice(node:Element,frames:Keyframe[],duration:number):()=>void {
 if(reducedMotion()||document.hidden||!node.animate)return ()=>{};
 const box=node.getBoundingClientRect();
 if(box.bottom<=0||box.top>=innerHeight||box.right<=0||box.left>=innerWidth)return ()=>{};
 const animation=node.animate(frames,{duration,easing:'cubic-bezier(.2,.7,.2,1)'});
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');
 const stop=()=>{animation.cancel();observer?.disconnect();media.removeEventListener('change',changed);document.removeEventListener('visibilitychange',hidden);};
 const changed=()=>{if(media.matches)stop();},hidden=()=>{if(document.hidden)stop();};
 const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(!entries[0]?.isIntersecting)stop();});
 observer?.observe(node);media.addEventListener('change',changed);document.addEventListener('visibilitychange',hidden);
 animation.onfinish=stop;animation.oncancel=stop;
 return stop;
}

/** No mount reveal: only the requested scope change moves the selected targets. */
export function useChoiceMotion<T extends Element>(ref:RefObject<T|null>,choice:string,selector:string,duration=180,ready=true){
 const previous=useRef(choice),seenReady=useRef(ready);
 useLayoutEffect(()=>{
  if(!ready)return;
  if(!seenReady.current){seenReady.current=true;previous.current=choice;return;}
  const changed=previous.current!==choice;previous.current=choice;
  if(!changed||!ref.current)return;
  const stops=Array.from(ref.current.querySelectorAll(selector),node=>animateChoice(node,[{opacity:.55,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],duration));
  return()=>stops.forEach(stop=>stop());
 },[ref,choice,selector,duration,ready]);
}

/** Only translate the selection marker; sampled bounds and readings never interpolate. */
export function useSelectionMotion(ref:RefObject<SVGGElement|null>,x:number,selection:string,domain:string,immediate:RefObject<boolean>){
 const previous=useRef({x,selection,domain});
 useLayoutEffect(()=>{
  const before=previous.current;previous.current={x,selection,domain};
  if(!ref.current||immediate.current||before.domain!==domain||before.selection===selection||!Number.isFinite(before.x)||!Number.isFinite(x))return;
  return animateChoice(ref.current,[{transform:`translateX(${before.x-x}px)`},{transform:'translateX(0)'}],160);
 },[ref,x,selection,domain,immediate]);
}

/** Compare visible item content, not list positions; unchanged instructions stay still. */
export function usePrepChangeMotion(ref:RefObject<HTMLElement|null>,choice:string){
 const previous=useRef<{choice:string;items:Map<string,string>}|null>(null);
 useLayoutEffect(()=>{
  if(!ref.current)return;
  const nodes=Array.from(ref.current.querySelectorAll<HTMLElement>('[data-prep-motion]'));
  const items=new Map(nodes.map(node=>[node.dataset.prepMotion!,node.textContent??'']));
  const before=previous.current;previous.current={choice,items};
  if(!before||before.choice===choice)return;
  const stops=nodes.filter(node=>before.items.get(node.dataset.prepMotion!)!==node.textContent).map(node=>animateChoice(node,[{opacity:.55,transform:'translateX(-3px)'},{opacity:1,transform:'translateX(0)'}],180));
  return()=>stops.forEach(stop=>stop());
 });
}
