import {notFound} from 'next/navigation';
import PersonalToolsPreview from '../../personal-tools/preview';

export const metadata={title:'KORETAIL · 개인 도구 준비',robots:{index:false,follow:false,noarchive:true}};
export default async function Page({params}:{params:Promise<{locale:string}>}) {
  // Local-only readiness surface. OAuth, privacy review and browser acceptance
  // must be completed separately before any production entry point is added.
  if(process.env.NODE_ENV==='production')notFound();
  if((await params).locale!=='ko')notFound();
  return <PersonalToolsPreview/>;
}
