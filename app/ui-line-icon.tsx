import type {CSSProperties} from 'react';
export type LineIconKind='today'|'change'|'return'|'week'|'month'|'chart';
const paths:Record<LineIconKind,string>={today:'M6 3v3M14 3v3M3 8h14M4 5h12v12H4zM7 12l2 2 4-4',change:'M3 16V4M3 16h14M6 12l4-4 3 2 4-6',return:'M6 6H3v-3M3 6a7 7 0 1 1-1 7M7 10h7M11 7l3 3-3 3',week:'M6 3v3M14 3v3M3 8h14M4 5h12v12H4zM7 11h6M7 14h3',month:'M6 3v3M14 3v3M3 8h14M4 5h12v12H4zM7 11h1M12 11h1M7 14h1M12 14h1',chart:'M3 3v14h14M6 12l4-4 3 2 4-6'};
/** Hand-drawn, decorative monochrome line marks; the adjacent text names the topic. */
export function UiLineIcon({kind,style}:{kind:LineIconKind;style?:CSSProperties}){return <svg className="ui-line-icon" data-line-icon={kind} width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}><path d={paths[kind]}/></svg>;}
