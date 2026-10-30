import assert from 'node:assert/strict';
import test from 'node:test';
import {observeChartFillVisibility} from '../lib/chart-fill-visibility';

test('chart fill visibility controller', async t => {
  async function scenario(run: (env: ReturnType<typeof setup>) => void) {
    const env = setup();
    try { run(env); } finally { env.stop?.(); env.restore(); }
  }
  function setup() {
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const replace = (key: string, value: unknown) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, {configurable:true,writable:true,value}); };
    const calls: {target: FakeElement; frames: unknown; cancelled: boolean; onfinish?: () => void; oncancel?: () => void}[] = [];
    class FakeElement {
      namespaceURI = 'http://www.w3.org/1999/xhtml'; isConnected = true; parentElement: FakeElement | null = null;
      cssRunning = false; children: FakeElement[] = [];
      constructor(public kind: 'x' | 'y' | 'month' | 'root' = 'x') {}
      matches(selector: string) { return selector.split(',').some(part => {const s=part.trim(); return this.kind==='x' ? s==='.history-bars li > i' : this.kind==='y' ? s==='.chart-fill-y-svg' : this.kind==='month' ? s==='.airport-month-chart .airport-month-bar'||s==='.airport-month-bar' : false;}); }
      closest() { return null; }
      querySelectorAll(selector: string): FakeElement[] { return this.children.flatMap(child => [...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]); }
      contains(node: FakeElement): boolean { return this.children.some(child=>child===node||child.contains(node)); }
      getAnimations() { return this.cssRunning ? [{animationName:'chart-fill-horizontal',playState:'running'}] : []; }
      animate(frames: unknown) { const call = {target:this,frames,cancelled:false,oncancel:undefined as (()=>void)|undefined,onfinish:undefined as (()=>void)|undefined,cancel(){this.cancelled=true;this.oncancel?.();}}; calls.push(call); return call; }
    }
    const mutation: FakeMutation[] = [];
    class FakeMutation { disconnected=false; constructor(public callback: (records: unknown[])=>void){mutation.push(this);} observe(){} disconnect(){this.disconnected=true;} }
    const intersection: FakeIntersection[] = [];
    class FakeIntersection {
      watched = new Set<FakeElement>(); disconnected=false;
      constructor(public callback: (records: {target:FakeElement;isIntersecting:boolean}[])=>void){intersection.push(this);}
      observe(node: FakeElement){this.watched.add(node);} unobserve(node: FakeElement){this.watched.delete(node);} disconnect(){this.disconnected=true;this.watched.clear();}
      enter(node: FakeElement, isIntersecting=true){this.callback([{target:node,isIntersecting}]);}
    }
    const root = new FakeElement('root'), bar = new FakeElement(); root.children=[bar];
    const media = Object.assign(new EventTarget(),{matches:true});
    const doc = Object.assign(new EventTarget(),{documentElement:root,visibilityState:'visible',modal:false,querySelector(){return this.modal ? {} : null;}});
    replace('Element',FakeElement); replace('MutationObserver',FakeMutation); replace('IntersectionObserver',FakeIntersection);
    replace('document',doc); replace('window',{matchMedia:()=>media}); replace('CSS',{supports:()=>true});
    const stop=observeChartFillVisibility();
    return {bar,root,media,doc,calls,mutation,intersection,FakeElement,stop,restore(){for(const [key,original] of originals)if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key);}};
  }
  await t.test('offscreen marks wait, reveal once, and finish without changing values',()=>scenario(e=>{
    assert.equal(e.calls.length,0); e.intersection[0].enter(e.bar,false); assert.equal(e.calls.length,0);
    e.intersection[0].enter(e.bar); assert.equal(e.calls.length,1); assert.deepEqual(e.calls[0].frames,[{transform:'scaleX(0)'},{transform:'none'}]);
    e.intersection[0].enter(e.bar,false); assert.equal(e.calls[0].cancelled,true); e.intersection[0].enter(e.bar); assert.equal(e.calls.length,1);
  }));
  await t.test('an existing CSS reveal is not doubled, but a value update restarts it',()=>scenario(e=>{
    e.bar.cssRunning=true; e.intersection[0].enter(e.bar); assert.equal(e.calls.length,0);
    e.mutation[0].callback([{target:e.bar,attributeName:'style'}]); assert.equal(e.calls.length,1);
    e.mutation[0].callback([{target:e.bar,attributeName:'style'}]); assert.equal(e.calls.length,2); assert.equal(e.calls[0].cancelled,true);
  }));
  await t.test('a delayed viewport entry gets the full reveal even while mount CSS is running',()=>scenario(e=>{
    e.bar.cssRunning=true; e.intersection[0].enter(e.bar,false); e.intersection[0].enter(e.bar); assert.equal(e.calls.length,1);
  }));
  await t.test('a modal defers first reveal until close',()=>scenario(e=>{
    e.bar.cssRunning=true; e.doc.modal=true; e.intersection[0].enter(e.bar); assert.equal(e.calls.length,0);
    e.doc.modal=false; e.doc.dispatchEvent(new Event('close')); assert.equal(e.calls.length,1);
  }));
  await t.test('hidden documents defer new reveals and cancel active animation',()=>scenario(e=>{
    e.doc.visibilityState='hidden'; e.intersection[0].enter(e.bar); assert.equal(e.calls.length,0);
    e.doc.visibilityState='visible'; e.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(e.calls.length,1);
    e.doc.visibilityState='hidden'; e.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(e.calls[0].cancelled,true);
  }));
  await t.test('reduced motion keeps final states and a preference change cancels playback',()=>scenario(e=>{
    e.media.matches=false; e.intersection[0].enter(e.bar); assert.equal(e.calls.length,0);
    e.media.matches=true; e.media.dispatchEvent(new Event('change')); assert.equal(e.calls.length,0);
    e.mutation[0].callback([{target:e.bar,attributeName:'style'}]); assert.equal(e.calls.length,1);
    e.media.matches=false; e.media.dispatchEvent(new Event('change')); assert.equal(e.calls[0].cancelled,true);
  }));
  await t.test('viewport observation uses an untransformed parent instead of the scaling mark',()=>scenario(e=>{
    const track=new e.FakeElement('root'),mark=new e.FakeElement('y'); mark.namespaceURI='http://www.w3.org/2000/svg'; mark.parentElement=track; track.children=[mark]; e.root.children.push(track);
    e.mutation[1].callback([{addedNodes:[track],removedNodes:[]}]);
    assert.equal(e.intersection[0].watched.has(track),true); assert.equal(e.intersection[0].watched.has(mark),false);
    e.intersection[0].enter(track); assert.equal(e.calls.length,1); assert.equal(e.calls[0].target,mark);
  }));
  await t.test('SVG groups use the vertical axis and are removed and reinserted safely',()=>scenario(e=>{
    const group=new e.FakeElement('y'); group.namespaceURI='http://www.w3.org/2000/svg'; e.root.children.push(group);
    e.mutation[1].callback([{addedNodes:[group],removedNodes:[]}]); e.intersection[0].enter(group);
    assert.deepEqual(e.calls[0].frames,[{transform:'scaleY(0)'},{transform:'none'}]);
    e.mutation[1].callback([{addedNodes:[],removedNodes:[group]}]); assert.equal(e.intersection[0].watched.has(group),false); assert.equal(e.calls[0].cancelled,true);
    e.mutation[1].callback([{addedNodes:[group],removedNodes:[]}]); e.intersection[0].enter(group); assert.equal(e.calls.length,2);
    e.stop(); assert.equal(e.intersection[0].disconnected,true); assert.equal(e.calls[1].cancelled,true);
  }));
});
