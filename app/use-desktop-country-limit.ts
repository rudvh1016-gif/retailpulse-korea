'use client';
import {useEffect,useState,type RefObject} from 'react';

/** Layout only: no flight totals, shares, ordering or source records change. */
export function desktopCountryLimit(availableHeight:number,rowHeight:number,hasUnknown:boolean){
 if(!Number.isFinite(availableHeight)||!Number.isFinite(rowHeight)||rowHeight<=0)return 6;
 return Math.max(6,Math.min(24,Math.floor(Math.max(0,availableHeight)/rowHeight)*2-(hasUnknown?1:0)));
}

export function useDesktopCountryLimit(root:RefObject<HTMLElement|null>,refreshKey:string,hasUnknown:boolean){
 const [view,setView]=useState({limit:6,desktop:false});
 useEffect(()=>{
  const host=root.current;if(!host)return;
  const desktop=window.matchMedia('(min-width:1000px)');let frame=0,active=true,measuredWidth=0,rowHeight=0;
  const apply=(limit:number,isDesktop:boolean)=>setView(previous=>previous.limit===limit&&previous.desktop===isDesktop?previous:{limit,desktop:isDesktop});
  const measure=()=>{
   if(!active)return;
   if(!desktop.matches){apply(6,false);return;}
   const left=host.querySelector<HTMLElement>('.glance-destinations'),right=host.querySelector<HTMLElement>('.glance-ranking');
   const list=left?.querySelector<HTMLElement>(':scope > ul'),footer=left?.lastElementChild,rightFooter=right?.lastElementChild;
   if(!left||!right||!list||!footer||!rightFooter){apply(6,true);return;}
   // Read intrinsic content endpoints, not the stretched grid-column height.
   const leftBox=left.getBoundingClientRect(),listBox=list.getBoundingClientRect(),rightBox=right.getBoundingClientRect();
   if(Math.abs(listBox.width-measuredWidth)>1){measuredWidth=listBox.width;rowHeight=0;}
   // Keep the largest observed row at this width: long translated country names
   // cannot make the list alternate between two different visible counts.
   rowHeight=Math.max(rowHeight,...[...list.children].map(row=>row.getBoundingClientRect().height));
   const fixedHeight=listBox.top-leftBox.top+footer.getBoundingClientRect().bottom-listBox.bottom;
   const available=rightFooter.getBoundingClientRect().bottom-rightBox.top-fixedHeight;
   const next=desktopCountryLimit(available,rowHeight,hasUnknown);
   apply(next,true);
  };
  const schedule=()=>{if(!active)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
  observer?.observe(host);host.querySelectorAll('.glance-ranking,.glance-destinations > ul').forEach(node=>observer?.observe(node));
  desktop.addEventListener('change',schedule);window.addEventListener('resize',schedule);void document.fonts.ready.then(schedule);schedule();
  return()=>{active=false;cancelAnimationFrame(frame);observer?.disconnect();desktop.removeEventListener('change',schedule);window.removeEventListener('resize',schedule);};
 },[root,refreshKey,hasUnknown]);
 return view;
}
