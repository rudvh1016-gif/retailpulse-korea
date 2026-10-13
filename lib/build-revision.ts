type BuildRevision={sha:string|null;dirty:boolean|null};
export function parseBuildRevision(raw:string|undefined):BuildRevision{
 try{const value=JSON.parse(raw??'null');if(value&&typeof value.sha==='string'&&/^[a-f0-9]{40}$/.test(value.sha)&&typeof value.dirty==='boolean')return {sha:value.sha,dirty:value.dirty};}catch{}
 return {sha:null,dirty:null};
}
// Vite substitutes this one explicitly public build value, never arbitrary environment data.
export const buildRevision=parseBuildRevision(process.env.KORETAIL_BUILD_REVISION);
