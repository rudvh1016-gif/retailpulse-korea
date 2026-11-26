import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PersonalToolsPreview,{Snapshot} from '../app/personal-tools/preview';

test('preparation screen keeps anonymous use and clearly disables account and notification delivery',()=>{
  const html=renderToStaticMarkup(createElement(PersonalToolsPreview));
  assert.match(html,/개인 도구 준비 화면/);
  assert.match(html,/이 기기에만/);
  assert.match(html,/Google 로그인 준비 중/);
  assert.match(html,/NOT_IMPLEMENTED/);
  assert.match(html,/href="\/ko"/);
  assert.match(html,/<button[^>]*disabled[^>]*>Google 로그인 준비 중<\/button>/);
});


test('frozen briefing view labels bounded destinations without implying complete destination coverage',()=>{
  const html=renderToStaticMarkup(createElement(Snapshot,{value:{
    capturedAt:'2026-11-12T04:00:00Z',day:'2026-11-12',terminal:'T2',side:null,open:'07:00',close:'15:00',
    status:'READY',reason:null,total:2,confirmed:2,retrievedAt:'2026-11-12T03:59:00Z',checkedAt:'2026-11-12T03:59:00Z',
    basis:'COLLECTED_FLIGHT_RECORDS',provisional:true,topDestinations:[{country:'JP',flights:1}],
  }}));
  assert.match(html,/확인된 목적지 상위 최대 6곳/);
  assert.match(html,/나머지 또는 미확인 목적지는 빠질 수 있어/);
  assert.match(html,/목록의 합계가 전체 출발편 수는 아닙니다/);
  assert.match(html,/2편/);assert.match(html,/JP 1편/);
});


test('imported bounded destination lists still render at most six places',()=>{
  const html=renderToStaticMarkup(createElement(Snapshot,{value:{
    capturedAt:'2026-11-12T04:00:00Z',day:'2026-11-12',terminal:'T2',side:null,open:'07:00',close:'15:00',
    status:'READY',reason:null,total:8,confirmed:8,retrievedAt:'2026-11-12T03:59:00Z',checkedAt:'2026-11-12T03:59:00Z',
    basis:'COLLECTED_FLIGHT_RECORDS',provisional:true,topDestinations:Array.from({length:8},(_,index)=>({country:`Place${index+1}`,flights:1})),
  }}));
  assert.match(html,/Place6 1편/);assert.doesNotMatch(html,/Place7|Place8/);
});

test('personal preparation requests its stylesheet only when the preview renders',()=>{
  const html=renderToStaticMarkup(createElement(PersonalToolsPreview));
  assert.equal(/<link[^>]*rel="stylesheet"[^>]*href="\/personal-tools-preview\.css"/.test(html),true);
});
