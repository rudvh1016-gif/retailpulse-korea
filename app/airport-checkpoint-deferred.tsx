'use client';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import type {AirportCheckpointSchematic} from './airport-checkpoint-schematic';
const Schematic=lazy(()=>import('./airport-checkpoint-schematic').then(module=>({default:module.AirportCheckpointSchematic})));
/** Keep the new below-fold drawing, its CSS and render bytes off the initial
 * loading path. Reserve its region and mount before it enters the viewport. */
export default function AirportCheckpointDeferred(props:Parameters<typeof AirportCheckpointSchematic>[0]) {
 const anchor=useRef<HTMLDivElement>(null),[near,setNear]=useState(false);
 useEffect(()=>{
  const node=anchor.current;if(!node)return;
  if(!window.IntersectionObserver){const task=window.setTimeout(()=>setNear(true),0);return()=>clearTimeout(task);}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'100px'});
  observer.observe(node);return()=>observer.disconnect();
 },[]);
 const pending=<div style={{minBlockSize:340}} data-testid="checkpoint-schematic" data-terminal={props.terminal} aria-busy="true"/>;
 return <div ref={anchor}>{near?<Suspense fallback={pending}><Schematic {...props}/></Suspense>:pending}</div>;
}
