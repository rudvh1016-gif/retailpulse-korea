'use client';
import {useRouter} from 'next/navigation';
import type {Lang} from './retailpulse-data';
import {TravelRecordsView} from './travel-records-view';
export default function TravelRecordsClient({lang}:{lang:Lang}){
 const router=useRouter();
 return <TravelRecordsView lang={lang} navigateLocale={next=>router.push(`/${next}/travel-records${location.hash}`)}/>;
}
