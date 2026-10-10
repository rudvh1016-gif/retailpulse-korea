import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {seoLocales,type SeoLocale} from '../../seo-config';
import {preloadShellFont} from '../../shell-font-preload';
import {airportNewsCopy} from '../../../lib/airport-customs-news-copy';
import {kstDayOf} from '../../../lib/kst';
import AirportCustomsNewsClient from '../../airport-customs-news-client';
export function generateStaticParams(){return seoLocales.map(locale=>({locale}));}
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;if(!seoLocales.includes(locale as SeoLocale))return {};const copy=airportNewsCopy[locale as SeoLocale];return {title:`${copy.title} | KORETAIL`,description:copy.intro,robots:{index:false,follow:false},alternates:{canonical:`/${locale}/airport-news`,languages:Object.fromEntries(seoLocales.map(lang=>[lang,`/${lang}/airport-news`]))}};}
export default async function AirportNewsPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!seoLocales.includes(locale as SeoLocale))notFound();preloadShellFont(locale as SeoLocale);return <AirportCustomsNewsClient lang={locale as SeoLocale} today={kstDayOf(new Date().toISOString())}/>;}
