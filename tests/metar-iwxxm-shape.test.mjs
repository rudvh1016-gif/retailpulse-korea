import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRksiMetarItem} from '../scripts/parse-rksi-metar-item.mjs';
import {probeRksiOnce} from '../scripts/probe-rksi-metar-once.mjs';
import {checkRksiSchemaOnce} from '../scripts/check-rksi-metar-schema-once.mjs';

const observed='2026-10-06T14:30:00Z';
const nested=()=>({'iwxxm:METAR':{permissibleUsage:'OPERATIONAL',status:'NORMAL',msgText:'METAR RKSI 061430Z 18000KT 0000 0/0 Q1016=', 'iwxxm:observation':{'om:OM_Observation':{'om:phenomenonTime':{'gml:TimeInstant':{'gml:timePosition':observed}},'om:featureOfInterest':{'sams:SF_SpatialSamplingFeature':{'sf:sampledFeature':{'aixm:AirportHeliport':{'aixm:timeSlice':{'aixm:AirportHeliportTimeSlice':{'aixm:locationIndicatorICAO':'RKSI','aixm:designator':'RKSI'}}}}}},'om:result':{'iwxxm:MeteorologicalAerodromeObservationRecord':{'iwxxm:airTemperature':{uom:'Cel',content:0},'iwxxm:meanWindSpeed':{uom:'[kn_i]',content:0},'iwxxm:prevailingVisibility':{uom:'m',content:0}}}}}}});
const xml=`<iwxxm:METAR xmlns:iwxxm="http://icao.int/iwxxm/2.0" xmlns:om="http://www.opengis.net/om/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" status="NORMAL"><msgText>METAR RKSI 061430Z 18007KT 4200 19/12 Q1016=</msgText><iwxxm:observation><om:OM_Observation><om:phenomenonTime><gml:TimeInstant gml:id="time"><gml:timePosition>${observed}</gml:timePosition></gml:TimeInstant></om:phenomenonTime><om:result><iwxxm:MeteorologicalAerodromeObservationRecord><iwxxm:airTemperature uom="Cel">19</iwxxm:airTemperature><iwxxm:meanWindSpeed uom="m/s">3.5</iwxxm:meanWindSpeed></iwxxm:MeteorologicalAerodromeObservationRecord></om:result></om:OM_Observation></iwxxm:observation></iwxxm:METAR>`;
const obsNode=item=>item['iwxxm:METAR']['iwxxm:observation']['om:OM_Observation'];
test('official nested IWXXM JSON reads actual observation branch and zero measurements with units',()=>{
 const result=inspectRksiMetarItem(nested());assert.equal(result.encoding,'NESTED_JSON');assert.equal(result.observation.station,'RKSI');assert.equal(result.observation.observedAt,observed);assert.equal(result.observation.measurements.meanWindSpeed.value,0);assert.equal(result.observation.measurements.meanWindSpeed.unit,'[kn_i]');assert.equal(result.observation.measurements.prevailingVisibility.value,0);assert.match(result.fieldPaths.find(x=>x.field==='observedAt').path,/phenomenonTime.gml:TimeInstant.gml:timePosition$/);
});
test('XML string in JSON is parsed without retaining original message or arbitrary fields',()=>{
 const marker='fixture-private-material-do-not-log';const result=inspectRksiMetarItem({metarMsg:xml,[marker]:marker});assert.equal(result.encoding,'XML_IN_JSON');assert.equal(result.observation.measurements.meanWindSpeed.unit,'m/s');assert.equal(result.observation.measurements.airTemperature.value,19);assert.equal(JSON.stringify(result).includes(marker),false);assert.equal(JSON.stringify(result).includes('METAR RKSI'),false);
});
test('trend and result/issue times cannot substitute for missing observation time',()=>{
 const item=nested(),root=item['iwxxm:METAR'];delete obsNode(item)['om:phenomenonTime'];obsNode(item)['om:resultTime']={'gml:TimeInstant':{'gml:timePosition':observed}};root['iwxxm:trendForecast']={'om:OM_Observation':{'om:phenomenonTime':{'gml:TimeInstant':{'gml:timePosition':observed}}}};assert.equal(inspectRksiMetarItem(item).reason,'OBSERVATION_TIME_UNVERIFIED');
});
test('TAC/calendar/station conflicts fail closed without inventing station or date',()=>{
 let item=nested();obsNode(item)['om:phenomenonTime']['gml:TimeInstant']['gml:timePosition']='2026-02-30T14:30:00Z';assert.equal(inspectRksiMetarItem(item).reason,'OBSERVATION_TIME_UNVERIFIED');
 item=nested();obsNode(item)['om:phenomenonTime']['gml:TimeInstant']['gml:timePosition']='2026-10-06T14:31:00Z';assert.equal(inspectRksiMetarItem(item).reason,'TAC_TIME_CONFLICT');
 item=nested();obsNode(item)['om:featureOfInterest']['sams:SF_SpatialSamplingFeature']['sf:sampledFeature']['aixm:AirportHeliport']['aixm:timeSlice']['aixm:AirportHeliportTimeSlice']['aixm:locationIndicatorICAO']='RKSS';assert.equal(inspectRksiMetarItem(item).reason,'CONFLICTING_STATION');
 item=nested();item['iwxxm:METAR'].msgText='SPECI RKSI 061430Z 18000KT 0000 0/0 Q1016=';assert.equal(inspectRksiMetarItem(item).reason,'CONFLICTING_REPORT_TYPE');
 item=nested();delete item['iwxxm:METAR'].msgText;delete obsNode(item)['om:featureOfInterest'];assert.equal(inspectRksiMetarItem(item).reason,'STATION_UNVERIFIED_OR_OTHER');
});
test('external XML declarations, invalid structure and ambiguous reports cannot cause I/O',()=>{
 assert.equal(inspectRksiMetarItem(`<!DOCTYPE x SYSTEM "https://example.invalid/private">${xml}`).reason,'BOUNDED_PARSE_REJECTED');assert.equal(inspectRksiMetarItem(xml.replace('</gml:timePosition>','</gml:wrong>')).reason,'BOUNDED_PARSE_REJECTED');assert.equal(inspectRksiMetarItem({xml,message:xml}).reason,'AMBIGUOUS_REPORT');
});
test('only local phenomenon-time references resolve; external references remain unverified',()=>{
 const referenced=xml.replace(/<om:phenomenonTime>[\s\S]*?<\/om:phenomenonTime>/,'<om:phenomenonTime xlink:href="#time"/>').replace('</iwxxm:METAR>',`<gml:TimeInstant gml:id="time"><gml:timePosition>${observed}</gml:timePosition></gml:TimeInstant></iwxxm:METAR>`);
 assert.equal(inspectRksiMetarItem(referenced).observation.observedAt,observed);assert.equal(inspectRksiMetarItem(referenced.replace('href="#time"','href="https://example.invalid/time"')).reason,'OBSERVATION_TIME_UNVERIFIED');
});
test('unknown units and nil values are withheld; ground wind never produces turbulence risk',()=>{
 const item=nested(),record=obsNode(item)['om:result']['iwxxm:MeteorologicalAerodromeObservationRecord'];record['iwxxm:meanWindSpeed'].uom='untrusted-secret';record['iwxxm:airTemperature']['xsi:nil']='true';const result=inspectRksiMetarItem(item);assert.equal(result.observation.measurements.meanWindSpeed,undefined);assert.equal(result.observation.measurements.airTemperature,undefined);assert.equal(result.observation.turbulenceRisk,'NOT_INFERRED');assert.equal(JSON.stringify(result).includes('untrusted-secret'),false);
});
test('new schema adapter still makes a single fixed request and outputs only safe public data',async()=>{
 let calls=0;const key='fixture-secret-do-not-log';const result=await probeRksiOnce({serviceKey:key,timeoutMs:30000,fetchImpl:async()=>{calls++;return Response.json({response:{header:{resultCode:'00'},body:{pageNo:1,numOfRows:100,totalCount:1,items:{item:nested()}}}});}});assert.equal(calls,1);assert.equal(result.status,'VERIFIED_CONTRACT');assert.equal(result.matchedStationCount,1);assert.equal(result.observations[0].observedAt,observed);assert.equal(JSON.stringify(result).includes(key),false);
});
test('schema confirmation requires its separate manual flag before creating any transport',async()=>{
 let calls=0;const transportFactory=()=>{calls++;throw Error('must not create transport');};
 for(const [eventName,onceFlag] of [['schedule','1'],['workflow_dispatch','0'],['workflow_dispatch',undefined]]){
  const result=await checkRksiSchemaOnce({eventName,onceFlag,transportFactory});assert.equal(result.requestCount,0);assert.equal(result.status,'SERVER_SCHEMA_ONCE_MODE_REQUIRED');
 }assert.equal(calls,0);
});
test('authorized schema confirmation has exactly one 30-second request and no persistence',async()=>{
 let calls=0;const stages={phase:'COMPLETE',deadline:false,errorCode:null,events:[]};
 const result=await checkRksiSchemaOnce({eventName:'workflow_dispatch',onceFlag:'1',serviceKey:'fixture-only',transportFactory:()=>({stages,fetchImpl:async()=>{calls++;return Response.json({response:{header:{resultCode:'00'},body:{pageNo:1,numOfRows:100,totalCount:1,items:{item:nested()}}}});}})});
 assert.equal(calls,1);assert.equal(result.timeoutMs,30000);assert.equal(result.status,'VERIFIED_CONTRACT');assert.equal(result.transport,stages);
});
