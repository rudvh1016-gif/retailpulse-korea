import type {StoredPhoto} from './types';
export function imageHeader(bytes:ArrayBuffer|Uint8Array):{type:string;width:number;height:number};
export function preparePhoto(file:File):Promise<StoredPhoto>;
export function photoForBackup(photo:StoredPhoto|null):Promise<unknown>;
export function photoFromBackup(photo:unknown):Promise<StoredPhoto|null>;
export function toBase64(bytes:Uint8Array):string;
export function fromBase64(text:string):Uint8Array;
