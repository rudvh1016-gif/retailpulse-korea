import {expect,type Page,type TestInfo} from '@playwright/test';

export const passengerNoticeHref='/ko/airport-countries?mode=passengers#airport-route-passengers';
export async function clickPassengerNotice(page:Page,width:number){
 const link=page.getByRole('dialog').getByRole('link',{name:'국가별 실적 보기 →',exact:true});
 await link.scrollIntoViewIfNeeded();
 const current=new URL(page.url()),destination=new URL(passengerNoticeHref,page.url());
 if(current.pathname===destination.pathname&&current.search===destination.search){
  // A native same-document fragment activation needs no network navigation.
  if(width<600)await link.tap();else await link.click();return;
 }
 await Promise.all([
  page.waitForRequest(request=>request.isNavigationRequest()&&new URL(request.url()).pathname==='/ko/airport-countries'),
  width<600?link.tap():link.click(),
 ]);
}
/** Never scroll the target here: its initial arrival position is the contract. */
export async function expectPassengerNoticeLanding(page:Page,info?:TestInfo){
 await expect(page).toHaveURL(url=>url.pathname==='/ko/airport-countries'&&url.searchParams.get('mode')==='passengers'&&url.hash==='#airport-route-passengers');
 await expect(page.locator('#country-flow-tab-passengers')).toHaveAttribute('aria-selected','true');
 const target=page.getByTestId('airport-route-passengers');
 await expect(target.locator('tbody tr').first()).toBeVisible();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect.poll(()=>target.evaluate(element=>{
  let covered=0;
  for(const bar of document.querySelectorAll<HTMLElement>('.site-header,.airport-context-nav')){
   const style=getComputedStyle(bar),rect=bar.getBoundingClientRect();
   if((style.position==='sticky'||style.position==='fixed')&&rect.height&&rect.top<innerHeight&&rect.bottom>0)covered=Math.max(covered,rect.bottom);
  }
  const box=element.getBoundingClientRect(),heading=element.querySelector('h4')!.getBoundingClientRect();
  const firstRow=element.querySelector('tbody tr')!.getBoundingClientRect();
  const point=document.elementFromPoint(Math.max(1,Math.min(innerWidth-1,heading.x+heading.width/2)),heading.y+heading.height/2);
  return {arrived:box.top>=covered-1&&box.top<=covered+32,headingVisible:heading.top>=covered-1&&heading.bottom<=innerHeight,firstRowVisible:firstRow.top>=covered-1&&firstRow.bottom<=innerHeight,uncovered:!!point&&element.contains(point),unlocked:getComputedStyle(document.documentElement).overflow!=='hidden'&&getComputedStyle(document.body).overflow!=='hidden'};
 }),{timeout:15_000}).toEqual({arrived:true,headingVisible:true,firstRowVisible:true,uncovered:true,unlocked:true});
 if(info){await info.attach('passenger-arrival-geometry.json',{body:Buffer.from(JSON.stringify(await target.evaluate(element=>({section:element.getBoundingClientRect().toJSON(),heading:element.querySelector('h4')!.getBoundingClientRect().toJSON(),scrollY,viewport:{width:innerWidth,height:innerHeight},hash:location.hash})),null,2)),contentType:'application/json'});}
 return target;
}
