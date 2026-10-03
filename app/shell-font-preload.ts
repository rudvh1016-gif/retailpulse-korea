import {preload} from 'react-dom';
import type {SeoLocale} from './seo-config';
/** Same existing font face and bytes; make it discoverable before CSS on deep routes too. */
export function preloadShellFont(locale:SeoLocale) {
 const font={ko:'/fonts/koretail-sans-variable.woff2',en:'/fonts/koretail-sans-variable.woff2',ja:'/fonts/noto-sans-jp-400.woff2',zh:'/fonts/noto-sans-sc-400.woff2'}[locale];
 preload(font,{as:'font',type:'font/woff2',crossOrigin:'anonymous'});
}
