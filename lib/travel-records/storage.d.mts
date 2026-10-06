import type {TravelStore} from './types';
export function databaseName():string;
export function openStore(name?:string):Promise<TravelStore>;
