export function AirportNewsMark({topic='airport'}:{topic?:'airport'|'customs'}){
 return <svg viewBox="0 0 48 40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M27 4h13v29H27zM31 12h5m-5 5h5m-5 5h5"/>{topic==='airport'?<path d="m4 21 8-3 5-12 3 1-2 11 7 4-1 3-8-2-4 9-3-1 2-10-7 2z"/>:<><path d="M5 15h16v19H5zM5 15l8-8 8 8M9 21h8m-8 5h8"/><path d="m32 28 3 3 7-8" stroke="#4696bd"/></>}</svg>;
}
