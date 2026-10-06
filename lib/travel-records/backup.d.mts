import type {TravelRecord,TravelStore,ImportSummary} from './types';
export const FORMAT:string;
export function exportBackup(records:TravelRecord[]):Promise<Blob>;
export function parseBackup(file:File,signal?:AbortSignal):Promise<TravelRecord[]>;
export function previewImport(store:TravelStore,records:TravelRecord[]):Promise<ImportSummary>;
