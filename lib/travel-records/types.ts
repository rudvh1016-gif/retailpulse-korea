export type TravelFields = {date:string;from:string;to:string;memo:string};
export type StoredPhoto = {blob:Blob;type:string;name:string;width:number;height:number;sha256:string};
export type TravelRevision = number|string;
export type TravelRecord = TravelFields & {id:string;photo:StoredPhoto|null;createdAt:string;updatedAt:string;revision:TravelRevision;fingerprint:string};
export type ImportSummary = {added:number;sameId:number;duplicates:number};
export type TravelStore = {name:string;list:()=>Promise<TravelRecord[]>;get:(id:string)=>Promise<TravelRecord|null>;save:(record:TravelRecord,revision?:TravelRevision|null)=>Promise<TravelRecord>;remove:(id:string,expectedRevision:TravelRevision)=>Promise<TravelRecord>;importRecords:(records:TravelRecord[],signal?:AbortSignal)=>Promise<ImportSummary>;close:()=>void};
