import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Lang} from '../../app/retailpulse-data';
import {TravelRecordsView} from '../../app/travel-records-view';
import '../../app/globals.css';
function App(){
 const [lang,setLang]=useState<Lang>('ko');
 return <TravelRecordsView lang={lang} homeHref="#/" airportHref={null} navigateLocale={next=>{document.documentElement.lang=next;setLang(next);}}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
