import {preload} from 'react-dom';
import type {SeoLocale} from './seo-config';
/** Requests, before the stylesheet does, the one face `--font-ui` resolves to
 * for the locale (app/globals.css); all six would be 3.3 MB for a reader who
 * needs about 240 KB. `crossOrigin` is required: fonts load in CORS mode, so a
 * preload without it is fetched twice. The home does not call this (see
 * app/[locale]/page.tsx). */
export function preloadShellFont(locale:SeoLocale) {
 const font={ko:'/fonts/koretail-sans-variable.woff2',en:'/fonts/koretail-sans-variable.woff2',ja:'/fonts/noto-sans-jp-400.woff2',zh:'/fonts/noto-sans-sc-400.woff2'}[locale];
 preload(font,{as:'font',type:'font/woff2',crossOrigin:'anonymous'});
}
