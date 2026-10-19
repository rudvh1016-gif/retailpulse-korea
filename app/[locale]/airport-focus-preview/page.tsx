import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import AirportFocusPreview from '../../airport-focus-preview';
import type {Lang} from '../../retailpulse-data';
export const metadata:Metadata={title:'공항 중심 시안 | KORETAIL',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!['ko','en','zh','ja'].includes(locale))notFound();return <AirportFocusPreview lang={locale as Lang}/>;}
