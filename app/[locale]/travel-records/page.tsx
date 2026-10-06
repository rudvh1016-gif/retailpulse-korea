import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {seoLocales,socialImage,shareDescription,type SeoLocale} from '../../seo-config';
import {preloadShellFont} from '../../shell-font-preload';
import {travelRecordsCopy} from '../../travel-records-copy';
import TravelRecordsClient from '../../travel-records-client';

export function generateStaticParams(){return seoLocales.map(locale=>({locale}));}
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;if(!seoLocales.includes(locale as SeoLocale))return {};
 const c=travelRecordsCopy[locale as SeoLocale];
 return {title:`${c.title} | KORETAIL`,description:c.intro,robots:{index:false,follow:false},alternates:{canonical:`/${locale}/travel-records`,languages:Object.fromEntries(seoLocales.map(lang=>[lang,`/${lang}/travel-records`]))},openGraph:{title:'KORETAIL',description:shareDescription,url:`/${locale}/travel-records`,images:[socialImage]},twitter:{card:'summary_large_image',title:'KORETAIL',description:shareDescription,images:[socialImage.url]}};
}
export default async function TravelRecordsPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(!seoLocales.includes(locale as SeoLocale))notFound();
 preloadShellFont(locale as SeoLocale);
 return <TravelRecordsClient lang={locale as SeoLocale}/>;
}
