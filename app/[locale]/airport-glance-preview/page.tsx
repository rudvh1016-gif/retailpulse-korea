import {notFound} from 'next/navigation';
import AirportGlancePreview from '../../airport-glance-preview';
import type {Lang} from '../../retailpulse-data';
export const metadata={title:'KORETAIL · 공항 한눈에 미리보기',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(!['ko','en','zh','ja'].includes(locale))notFound();
 return <AirportGlancePreview lang={locale as Lang} artworkSrc="/images/airport-glance/approved-v1-1448.webp"/>;
}
