#!/usr/bin/env node
/** One-shot local candidate preparation; no DB, schedule, credential or approval changes. */
import {readFile} from 'node:fs/promises';
import {CALENDAR_SOURCES,parseCalendarBytes} from '../lib/official-calendar-parsers.mjs';
const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
const country=get('--source');if(!CALENDAR_SOURCES[country])throw Error('Use --source JP or US');
const file=args.includes('--input')?get('--input'):null;
if(Boolean(file)===args.includes('--fetch-once'))throw Error('Choose --input FILE or --fetch-once');
let bytes,requests=0;
if(file)bytes=await readFile(file);else{requests++;const r=await fetch(CALENDAR_SOURCES[country].url,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`HTTP_${r.status}_NO_RETRY`);if(Number(r.headers.get('content-length')??0)>1048576)throw Error('SOURCE_TOO_LARGE');const chunks=[];let total=0;for await(const part of r.body){total+=part.length;if(total>1048576)throw Error('SOURCE_TOO_LARGE');chunks.push(part);}bytes=Buffer.concat(chunks);}
const observedAt=file?(args.includes('--observed-at')?get('--observed-at'):null):new Date().toISOString();
if(!observedAt)throw Error('Local input requires the original --observed-at timestamp');
const result=parseCalendarBytes(country,bytes,observedAt);
process.stdout.write(JSON.stringify({...result,providerRequests:requests,databaseWrites:0,aiCalls:0},null,2)+'\n');
