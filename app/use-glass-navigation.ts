'use client';
import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';
import {reducedMotion} from '../lib/motion';

/** Only navigation feedback: existing page and data selection effects remain separate. */
export function useGlassNavigation(ref:RefObject<HTMLElement|null>,choice:string){
 const animations=useRef<Animation[]>([]),sync=useRef<((animate:boolean)=>void)|null>(null),previous=useRef(choice);
 useLayoutEffect(()=>{
  const nav=ref.current,pill=nav?.querySelector<HTMLElement>('.glass-nav-indicator');if(!nav||!pill)return;
  const stop=()=>{animations.current.forEach(a=>a.cancel());animations.current=[];};
  const update=(animate:boolean)=>{
   const active=nav.querySelector<HTMLElement>('a[aria-current]');if(!active||!nav.offsetWidth)return;
   const from=getComputedStyle(pill).transform,x=active.offsetLeft,width=active.offsetWidth;
   stop();pill.style.width=`${width}px`;pill.style.transform=`translateX(${x}px)`;
   if(!animate||reducedMotion()||document.hidden||!pill.animate)return;
   animations.current.push(pill.animate([{transform:from},{transform:`translateX(${x}px) scaleX(1.06)`,offset:.7},{transform:`translateX(${x}px) scaleX(1)`}],{duration:420,easing:'cubic-bezier(.32,.72,0,1)'}));
   const main=document.querySelector<HTMLElement>('main.page-shell');
   if(main)animations.current.push(main.animate([{transform:'translateY(7px)',opacity:.96},{transform:'translateY(0)',opacity:1}],{duration:320,easing:'cubic-bezier(.2,.7,.2,1)'}));
  };
  sync.current=update;update(previous.current!==choice);previous.current=choice;
 },[ref,choice]);
 useEffect(()=>{
  const nav=ref.current;if(!nav)return;const pill=nav.querySelector<HTMLElement>('.glass-nav-indicator');if(!pill)return;
  let down:{id:number;x:number;y:number;drag:boolean;left:number;width:number}|null=null,suppress=false,frame=0,nextX=0;
  const stop=()=>{animations.current.forEach(a=>a.cancel());animations.current=[];};
  const links=()=>Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
  const reset=()=>{if(down&&nav.hasPointerCapture(down.id))nav.releasePointerCapture(down.id);down=null;cancelAnimationFrame(frame);frame=0;nav.removeAttribute('data-dragging');};
  const start=(e:PointerEvent)=>{if(!e.isPrimary||e.button!==0)return;suppress=false;const box=nav.getBoundingClientRect();down={id:e.pointerId,x:e.clientX,y:e.clientY,drag:false,left:box.left,width:box.width};};
  const move=(e:PointerEvent)=>{
   if(!down||e.pointerId!==down.id)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;
   if(!down.drag){if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){reset();return;}if(Math.abs(dx)<8)return;down.drag=true;stop();nav.setPointerCapture(e.pointerId);nav.dataset.dragging='true';}
   nextX=Math.max(4,Math.min(e.clientX-down.left-pill.offsetWidth/2,down.width-pill.offsetWidth-4));
   if(!frame)frame=requestAnimationFrame(()=>{frame=0;pill.style.transform=`translateX(${nextX}px)`;});
  };
  const end=(e:PointerEvent)=>{if(!down)return;const wasDrag=down.drag;reset();if(!wasDrag)return;const target=links().reduce<HTMLAnchorElement|null>((best,a)=>{const b=a.getBoundingClientRect(),distance=Math.abs(e.clientX-b.left-b.width/2);if(!best)return a;const r=best.getBoundingClientRect();return distance<Math.abs(e.clientX-r.left-r.width/2)?a:best;},null);const unchanged=target?.hasAttribute('aria-current');target?.click();suppress=true;if(unchanged)sync.current?.(true);};
  const cancel=()=>{reset();sync.current?.(false);};
  const nativeDrag=(e:DragEvent)=>e.preventDefault();
  const click=(e:MouseEvent)=>{if(suppress&&e.detail>0){e.preventDefault();e.stopPropagation();suppress=false;}};
  const key=(e:KeyboardEvent)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const items=links(),i=items.indexOf(document.activeElement as HTMLAnchorElement);if(i<0)return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowRight'?1:-1)+items.length)%items.length;items[index].focus();};
  const resize=()=>{reset();sync.current?.(false);};const observer=new ResizeObserver(resize);observer.observe(nav);
  const media=window.matchMedia('(prefers-reduced-motion: reduce)'),changed=()=>{if(media.matches){stop();sync.current?.(false);}},hidden=()=>{if(document.hidden){stop();cancel();}};
  nav.addEventListener('dragstart',nativeDrag);nav.addEventListener('pointerdown',start);nav.addEventListener('pointermove',move);nav.addEventListener('pointerup',end);nav.addEventListener('pointercancel',cancel);nav.addEventListener('click',click,true);nav.addEventListener('keydown',key);media.addEventListener('change',changed);document.addEventListener('visibilitychange',hidden);
  return()=>{reset();stop();observer.disconnect();nav.removeEventListener('dragstart',nativeDrag);nav.removeEventListener('pointerdown',start);nav.removeEventListener('pointermove',move);nav.removeEventListener('pointerup',end);nav.removeEventListener('pointercancel',cancel);nav.removeEventListener('click',click,true);nav.removeEventListener('keydown',key);media.removeEventListener('change',changed);document.removeEventListener('visibilitychange',hidden);};
 },[ref]);
}
