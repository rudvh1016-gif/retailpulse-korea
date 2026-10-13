'use client';
import {useEffect,useRef} from 'react';
import type {Lang} from './retailpulse-data';
import type {DepartureStepId,departurePreparation} from '../lib/airport-departure-preparation';
import {loadMotion,reducedMotion} from '../lib/motion';
import styles from './departure-order-motion.module.css';

const words={ko:['순서 보기','체크인','보안검색','출국심사','탑승'],en:['View order','Check-in','Security','Immigration','Boarding'],zh:['查看顺序','值机','安检','出境审查','登机'],ja:['順序を見る','チェックイン','保安検査','出国審査','搭乗']} as const;
const core:Partial<Record<DepartureStepId,number>>={CHECK_IN:1,CHECK_IN_TAX:1,SECURITY:2,IMMIGRATION:3,GATE:4};
const paths=['','M4 19V9h16v10M7 9V5h7v4M7 13h4M15 13h2M2 19h20','M5 21V3h14v18M9 21V7h6v14M10 12h4','M5 3h12v18H5zM9 7h4M9 11h4M9 15h2M17 7h3v10h-3','m3 12 7 1 5 7h2l-2-7 5-2V9l-5 1-3-7h-2l1 8-6-1-2-3H2z'];

/** Decorative core route only; the adjacent DOM summary retains every conditional step. */
export function DepartureOrderMotion({plan,lang,choice}:{plan:ReturnType<typeof departurePreparation>;lang:Lang;choice:string}){
 const root=useRef<HTMLDivElement>(null),stop=useRef<()=>void>(()=>{}),generation=useRef(0);
 useEffect(()=>{const invalidate=()=>{generation.current++;stop.current();};invalidate();return invalidate;},[choice]);
 const play=async()=>{
  stop.current();const request=++generation.current,node=root.current;
  if(!node||reducedMotion()||document.hidden)return;
  const gsap=await loadMotion();
  if(!gsap||request!==generation.current||!node.isConnected||reducedMotion()||document.hidden)return;
  const rect=node.getBoundingClientRect();if(rect.bottom<=0||rect.top>=innerHeight)return;
  const links=node.querySelectorAll('[data-order-link]'),icons=node.querySelectorAll('[data-order-icon]');
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const timeline=gsap.timeline({onComplete:()=>finish()});
  const finish=()=>{timeline.kill();gsap.set([...links,...icons],{clearProps:'transform,opacity'});observer?.disconnect();media.removeEventListener('change',changed);document.removeEventListener('visibilitychange',hidden);};
  const changed=()=>{if(media.matches)finish();},hidden=()=>{if(document.hidden)finish();};
  const observer=new IntersectionObserver(entries=>{if(!entries[0]?.isIntersecting)finish();});
  observer.observe(node);media.addEventListener('change',changed);document.addEventListener('visibilitychange',hidden);stop.current=finish;
  timeline.fromTo(icons[0],{opacity:.45},{opacity:1,duration:.24},0);
  links.forEach((link,index)=>{timeline.fromTo(link,{scaleX:0,opacity:.4},{scaleX:1,opacity:1,duration:.65,ease:'power2.out'},index*.7+.15);timeline.fromTo(icons[index+1],{opacity:.45},{opacity:1,duration:.25},index*.7+.75);});
 };
 if(!plan.supported)return null;
 const steps=plan.steps.filter(step=>core[step.id]);
 return <div ref={root} className={styles.order} data-testid="departure-order-motion">
  <button type="button" onClick={play}>{words[lang][0]}</button>
  <div className={styles.route} aria-hidden="true">{steps.map((step,index)=><div className={styles.step} key={step.id} data-order-step={step.id}>
   {index>0&&<span className={styles.link} data-order-link/>}
   <svg data-order-icon viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={paths[core[step.id]!]}/></svg>
   <span>{words[lang][core[step.id]!]}</span>
  </div>)}</div>
 </div>;
}
