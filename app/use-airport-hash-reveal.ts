'use client';
import {useEffect} from 'react';

/**
 * Lands an airport-page visit on the section a glance link names (#id).
 *
 * The browser's own fragment scroll gives up at load: none of these sections is in the server
 * HTML, they mount 0.7–1.4 s after `load` once the summary, flights and month data arrive
 * (Playwright trace at 390px, 2026-10-14), and content above them keeps arriving after that. So:
 * wait for the id, align it below the sticky header and airport menu, keep it aligned while the
 * page above it settles, and stop at the visitor's first scroll, tap or key, or after 8 s.
 * A closed <details> target (or ancestor) is opened, since the link promises its contents.
 * Only the ids the glance links use; any other hash keeps the browser's behaviour.
 */
const TARGETS=new Set(['airport-forecast-title','airport-checkpoints-title','airport-departure-model-slot','airport-monthly-flights','airport-month-destinations','airport-route-passengers','airport-zone-countries','airport-concourse']);
const SETTLE_MS=8000;
const STOP_EVENTS=['wheel','touchstart','keydown','pointerdown'] as const;

/** Bottom edge of the sticky bars that will cover the top of the viewport after the scroll. */
function stickyOffset(){
 let bottom=0;
 for(const bar of document.querySelectorAll<HTMLElement>('.site-header, .airport-context-nav')){
  const style=getComputedStyle(bar);
  if((style.position==='sticky'||style.position==='fixed')&&bar.offsetHeight)bottom=Math.max(bottom,(parseFloat(style.top)||0)+bar.offsetHeight);
 }
 return bottom+8;
}

export function useAirportHashReveal(){
 useEffect(()=>{
  let finish=()=>{};
  const reveal=()=>{
   finish();
   const id=decodeURIComponent(location.hash.slice(1));
   if(!TARGETS.has(id))return;
   let done=false,frame=0;
   const align=()=>{
    frame=0;if(done)return;
    const target=document.getElementById(id);if(!target)return;
    if(target instanceof HTMLDetailsElement)target.open=true;
    for(let parent=target.parentElement?.closest('details');parent;parent=parent.parentElement?.closest('details'))parent.open=true;
    const top=Math.max(0,Math.round(target.getBoundingClientRect().top+window.scrollY-stickyOffset()));
    if(Math.abs(window.scrollY-top)>2)window.scrollTo({top,behavior:'instant'});
   };
   const schedule=()=>{if(!done&&!frame)frame=requestAnimationFrame(align);};
   const mutations=new MutationObserver(schedule),sizes=new ResizeObserver(schedule);
   mutations.observe(document.body,{childList:true,subtree:true});sizes.observe(document.body);
   const stop=()=>finish(),timer=window.setTimeout(stop,SETTLE_MS);
   for(const type of STOP_EVENTS)window.addEventListener(type,stop,{capture:true,passive:true});
   finish=()=>{
    if(done)return;done=true;cancelAnimationFrame(frame);mutations.disconnect();sizes.disconnect();window.clearTimeout(timer);
    for(const type of STOP_EVENTS)window.removeEventListener(type,stop,{capture:true});
   };
   schedule();
  };
  reveal();
  window.addEventListener('hashchange',reveal);
  return()=>{finish();window.removeEventListener('hashchange',reveal);};
 },[]);
}
