'use client';
import type {Lang} from './retailpulse-data';
import {FocusLiveData} from './airport-focus-live-data';
import {airportFocusCopy} from './airport-focus-copy';
import {HolidayList} from './airport-focus-preview';
import {PreparationArrivalLink} from './preparation-arrival-link';
import ArrivalAllowances from './arrival-allowances-preview';
import './preparation-calendar.css';
export function AirportPreparation({lang}:{lang:Lang}){const copy=airportFocusCopy(lang);return <FocusLiveData><div className="airport-focus-shell airport-focus-operating"><div className="focus-detail"><h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>{copy.prepare}</h1><p className="focus-lead">{copy.prepareHelp}</p><PreparationArrivalLink lang={lang}/><HolidayList lang={lang} full/><ArrivalAllowances lang={lang}/><a className="focus-related" href={`/${lang}/airport-news`}>{copy.newsMore}</a></div></div></FocusLiveData>;}
