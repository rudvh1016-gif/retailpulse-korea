/** Unrelated UI checks visit as returning readers. Notice-specific checks use a clean state.
 * @param {string} origin
 * @param {Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>} state
 */
export function noticeDismissedState(origin='http://127.0.0.1:4173',state={cookies:[],origins:[]}){
 const url=new URL(origin).origin,result=structuredClone(state);
 let entry=result.origins.find(row=>row.origin===url);
 if(!entry){entry={origin:url,localStorage:[]};result.origins.push(entry);}
 entry.localStorage.push({name:'koretail-notice:airport-flow-20261021-v1:until',value:String(Date.UTC(2099,0,1))});
 return result;
}
