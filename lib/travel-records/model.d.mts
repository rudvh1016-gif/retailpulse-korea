import type {TravelFields,TravelRecord,StoredPhoto} from './types';
export const LIMITS:Readonly<{records:number;sourcePhoto:number;photo:number;totalPhotos:number;backup:number;pixels:number;edge:number}>;
export class TravelError extends Error {code:string;constructor(code:string,message:string)}
export function fail(code:string,message:string):never;
export function exactKeys(value:unknown,keys:string[],label:string):void;
export function cleanText(value:unknown,max:number,label:string):string;
export function dateValue(value:unknown):string;
export function fields(value:TravelFields):TravelFields;
export function isUUID(value:unknown):boolean;
export function isoValue(value:unknown):string;
export function sha256(data:Blob|BufferSource|string):Promise<string>;
export function fingerprint(record:TravelFields & {photo?:StoredPhoto|null}):Promise<string>;
export function makeRecord(input:TravelFields,photo?:StoredPhoto|null,previous?:TravelRecord|null):Promise<TravelRecord>;
export function mergePlan(existing:TravelRecord[],incoming:TravelRecord[]):{add:TravelRecord[];sameId:number;duplicates:number};
export function errorText(error:unknown):string;
