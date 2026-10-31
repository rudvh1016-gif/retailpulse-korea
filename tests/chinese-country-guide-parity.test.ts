import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SiteUsageGuide} from '../app/site-usage-guide';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {default:CountryFlightPanel,formatFlightChangeRate,FlightCountChange}=await import('../app/airport-country-flights');
const {default:AirportCountryZones}=await import('../app/airport-country-zones');

test('Chinese country-flight loading and zone controls have no Korean fallback',()=>{
 for(const Component of [CountryFlightPanel,AirportCountryZones]){
  const html=renderToStaticMarkup(h(Component,{lang:'zh',date:'2026-10-19'}));
  assert.doesNotMatch(html,/[가-힣]/);assert.match(html,/T1主楼/);assert.match(html,/卫星厅/);
  assert.match(html,/正在加载/);assert.doesNotMatch(html,/NaN|Infinity/);
 }
});
test('Chinese change formatting preserves signed whole numbers, small bounds and missing values',()=>{
 for(const value of [null,undefined,NaN,Infinity,-Infinity])assert.equal(formatFlightChangeRate(value,'zh'),'—');
 for(const [value,label] of [[0,'0%'],[0.1,'+不足1%'],[-0.1,'△不足1%'],[0.5,'+1%'],[-0.5,'△1%'],[12.4,'+12%'],[-12.5,'△13%']] as const)assert.equal(formatFlightChangeRate(value,'zh'),label);
 assert.equal(formatFlightChangeRate(-0.1),'△1% 미만');
 for(const [delta,label,direction] of [[null,'暂无变化资料','neutral'],[NaN,'暂无变化资料','neutral'],[Infinity,'暂无变化资料','neutral'],[0,'无变化','neutral'],[0.1,'增加不足1班/日','up'],[-0.1,'减少不足1班/日','down']] as const){
  const html=renderToStaticMarkup(h(FlightCountChange,{delta,lang:'zh'}));
  assert.ok(html.includes(`aria-label="${label}"`));assert.ok(html.includes(`data-direction="${direction}"`));
  assert.doesNotMatch(html,/[가-힣]|NaN|Infinity/);
 }
});
test('Chinese guide has the same four airport entry points and truth boundaries as Korean',()=>{
 const html=renderToStaticMarkup(h(SiteUsageGuide,{lang:'zh'}));
 assert.doesNotMatch(html,/[가-힣]/);
 for(const path of ['/zh','/zh/airport','/zh/airport-countries','/zh/airport-prepare'])assert.ok(html.includes(`href="${path}"`));
 for(const text of ['未来1、3、6小时','基准期和比较期','缺失日期不按0计算','目的地国家不代表乘客国籍','不区分韩国人与外国人','节假日前后的差异不能证明','不预测销售额'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/<details\b/g)??[]).length,4);
 assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
});
test('Chinese zone language reaches both existing country and monthly data views',()=>{
 const source=readFileSync('app/airport-country-zones.tsx','utf8');
 assert.match(source,/map=\{map\} lang=\{lang\}/);
 assert.match(source,/<AirportMonthlyFlights lang=\{lang\}/);
 assert.match(source,/current\.payload\.truncated===false/);
 assert.match(source,/map\.nextDay==='MISSING'/);
});
