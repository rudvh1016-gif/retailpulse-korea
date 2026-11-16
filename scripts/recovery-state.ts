import { readFileSync,writeFileSync,renameSync,mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {emptyAdmission,type AdmissionState} from '../lib/recovery-runtime';
export function loadRecoveryState(path:string,bootstrap=false):AdmissionState {
 let text:string;
 try{text=readFileSync(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'&&bootstrap)return emptyAdmission();throw Error('recovery_admission_state_unavailable');}
 if(text.length>65536)throw Error('recovery_admission_state_invalid');
 const state=JSON.parse(text) as AdmissionState;
 if(state.version!==1||!state.blocked||!state.notices||typeof state.blocked!=='object'||typeof state.notices!=='object'||Array.isArray(state.blocked)||Array.isArray(state.notices)||Object.keys(state.blocked).length>32||Object.keys(state.notices).length>128||Object.values(state.blocked).some(v=>typeof v!=='boolean')||Object.values(state.notices).some(v=>typeof v!=='string'))throw Error('recovery_admission_state_invalid');
 if(state.sizes&&(typeof state.sizes!=='object'||Array.isArray(state.sizes)||Object.keys(state.sizes).length>32||Object.values(state.sizes).some(point=>!point||!Number.isFinite(Date.parse(point.at))||!Number.isSafeInteger(point.bytes)||point.bytes<0)))throw Error('recovery_admission_size_invalid');
 return state;
}
export function saveRecoveryState(path:string,state:AdmissionState) {
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(path+'.tmp',path);
}
