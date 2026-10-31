import {expect,type Page} from '@playwright/test';

// Measure only rendered label text, excluding the absolutely positioned underline.
export async function expectMobileTerminalTextSpacing(page:Page){
 const row=page.locator('.airport-focus-operating .glance-controls > div[role=group]');
 const buttons=row.locator('button');await expect(buttons).toHaveCount(4);
 const metrics=await buttons.evaluateAll(nodes=>nodes.map(node=>{
  const box=node.getBoundingClientRect(),range=document.createRange();
  const text=[...node.childNodes].find(child=>child.nodeType===Node.TEXT_NODE&&child.textContent?.trim());
  if(!text)throw Error('Terminal label text node is missing');
  range.selectNodeContents(text);const label=range.getBoundingClientRect();
  return {text:text.textContent,left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height,textLeft:label.left,textRight:label.right,textTop:label.top,textBottom:label.bottom,clipped:node.scrollWidth>node.clientWidth};
 }));
 const bounds=(await row.boundingBox())!;
 expect(metrics[0].textLeft).toBeCloseTo(bounds.x,1);
 for(const item of metrics){
  expect(item.width).toBeGreaterThanOrEqual(44);expect(item.height).toBeGreaterThanOrEqual(44);expect(item.clipped).toBe(false);
  expect(item.textLeft).toBeGreaterThanOrEqual(item.left);expect(item.textRight).toBeLessThanOrEqual(item.right);
  expect(item.top).toBe(metrics[0].top);expect(item.textBottom).toBeLessThanOrEqual(item.bottom);
 }
 for(let i=1;i<metrics.length;i++)expect(metrics[i].textLeft-metrics[i-1].textRight).toBeCloseTo(32,1);
 expect(metrics.at(-1)!.right).toBeLessThanOrEqual(bounds.x+bounds.width+1);
 const lang=new URL(page.url()).pathname.split('/')[1];
 const hasTabs=lang==='ko'||lang==='zh';
 await expect(page.locator('.airport-insight-tab-nav')).toHaveCount(hasTabs?1:0);
 const nav=(await page.locator(hasTabs?'.airport-insight-tab-nav':'.airport-focus-operating .glance-heading').boundingBox())!;
 const date=(await page.locator('.glance-date-control').boundingBox())!;
 expect(bounds.y-(nav.y+nav.height)).toBeCloseTo(hasTabs?4:0,1);
 expect(date.y-(bounds.y+bounds.height)).toBeCloseTo(0,1);
 const selected=buttons.locator('[aria-hidden=true].glance-selection-rule');
 await expect(selected).toHaveCSS('left','0px');await expect(selected).toHaveCSS('right','32px');await expect(selected).toHaveCSS('height','2px');
 return {metrics,navToTerminal:bounds.y-nav.y-nav.height,terminalToDate:date.y-bounds.y-bounds.height};
}
