import type {ReactNode} from 'react';

/** Optional explanation stays available without crowding the first reading. */
export function ConciseExplainer({summary,children}:{summary:string;children:ReactNode}) {
 return <details className="concise-explainer">
  <summary style={{minHeight:44,boxSizing:'border-box',padding:'12px 0',cursor:'pointer'}}>{summary}</summary>
  {children}
 </details>;
}
