/** Original KORETAIL navigation silhouettes, drawn on a shared 24px grid. */
export function NavigationIcon({name}:{name:string}) {
 const paths:Record<string,string>={
  'airport-glance':'M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v5h16V5H4Zm0 7v7h6v-7H4Zm8 0v7h8v-7h-8Z',
  airport:'M11 2h2l1.1 7.1 7.4 4.3v2.1l-7.1-2.1.5 5.2 2.6 1.8V22L12 20.7 6.5 22v-1.6l2.6-1.8.5-5.2-7.1 2.1v-2.1l7.4-4.3L11 2Z',
  'where-to':'M12 2a7 7 0 0 1 7 7c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 7-7Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  today:'M3 10h5v11H3V10Zm7-7h5v18h-5V3Zm7 4h4v14h-4V7ZM11 6v2h3V6h-3Zm0 4v2h3v-2h-3ZM4 13v2h3v-2H4Zm14-3v2h2v-2h-2Z',
  consumption:'M3 13h4v8H3v-8Zm6-4h4v12H9V9Zm6 4h4v8h-4v-8Zm3-11a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-.7 2v1h-1v4h1v1h1.4V9h1V5h-1V4h-1.4Zm0 2h1.4v2h-1.4V6Z',
  business:'M4 3h16l2 6a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2l2-6Zm0 10h2v7h4v-6h4v6h4v-7h2v9H4v-9Z',
  more:'M5 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm7 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm7 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
 };
 return <svg className="navigation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" stroke="none" fillRule="evenodd" d={paths[name]??paths.more}/></svg>;
}
