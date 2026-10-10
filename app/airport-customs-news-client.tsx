'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AirportCustomsNews} from './airport-customs-news';
import {airportNewsCopy} from '../lib/airport-customs-news-copy';
import {travelRecordsCopy} from './travel-records-copy';
import {mayPublishNews,type OfficialNews} from '../lib/airport-customs-news';
import type {Lang} from './retailpulse-data';
export default function AirportCustomsNewsClient({lang,today}:{lang:Lang;today:string}){
 const router=useRouter(),copy=airportNewsCopy[lang];
 const [items,setItems]=useState<OfficialNews[]>([]),[state,setState]=useState<'loading'|'ready'|'error'>('loading'),[calendar,setCalendar]=useState(today),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const abort=new AbortController();let active=true;
  fetch('/api/airport/news',{signal:abort.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('NEWS_UNAVAILABLE');const body=await response.json();if(body.status==='UNAVAILABLE'||!Array.isArray(body.items))throw Error('NEWS_UNAVAILABLE');
   if(active){setItems(body.items.filter((item:OfficialNews)=>{try{return mayPublishNews(item);}catch{return false;}}));if(/^\d{4}-\d{2}-\d{2}$/.test(body.today))setCalendar(body.today);setState('ready');}
  }).catch(()=>{if(active)setState('error');});return()=>{active=false;abort.abort();};
 },[attempt]);
 return <div className={`app lang-${lang}`} data-testid="airport-customs-news"><a className="sr-only airport-news-skip" href="#airport-news-main">{copy.title}</a><div className="site-header"><header className="topbar"><a className="brand" href={`/${lang}`}><span translate="no">KORETAIL</span><span className="brand-descriptor">Retail Demand Signals for Korea</span></a><div className="header-meta"><a href={`/${lang}/airport`}>{copy.airport}</a><label className="language-control"><span className="sr-only">{travelRecordsCopy[lang].language}</span><select aria-label={travelRecordsCopy[lang].language} value={lang} onChange={event=>router.push(`/${event.target.value}/airport-news${location.hash}`)}><option value="ko">한국어</option><option value="en">English</option><option value="zh">简体中文</option><option value="ja">日本語</option></select></label></div></header></div>
  <main id="airport-news-main" className="airport-news-main">
   {state==='loading'?<p role="status" aria-live="polite">{copy.loading}</p>:state==='error'?<div role="alert"><p>{copy.unavailable}</p><button type="button" onClick={()=>{setState('loading');setAttempt(n=>n+1);}}>{copy.retry}</button></div>:null}
   <AirportCustomsNews items={items} today={calendar} lang={lang} syncUrl suppressEmpty={state!=='ready'}/>
   <nav className="airport-news-saved" aria-label={travelRecordsCopy[lang].title}><a href={`/${lang}/travel-records`}>{travelRecordsCopy[lang].list}</a></nav>
  </main></div>;
}
