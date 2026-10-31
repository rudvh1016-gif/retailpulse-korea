import {test,expect} from '@playwright/test';
for(const lang of ['ko','en','zh','ja'])for(const width of [320,1440])test(`${lang} current checkpoints are final glance content at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto(`/${lang}`,{waitUntil:'domcontentloaded'});
 const tail=page.locator('.glance-preview > .home-checkpoint-waits');
 await expect(tail).toHaveCount(1);
 await expect(tail.locator('#focus-country-trends')).toHaveCount(0);
 await expect(tail.locator('h2')).toHaveCount(1);
 await tail.scrollIntoViewIfNeeded();
 const order=await tail.evaluate(element=>{
  const siblings=[...element.parentElement!.children];const index=siblings.indexOf(element);
  return {after:siblings.slice(index+1).map(node=>node.tagName),before:siblings.slice(0,index).map(node=>node.className),top:element.getBoundingClientRect().top,previousBottom:element.previousElementSibling!.getBoundingClientRect().bottom};
 });
 expect(order.after).toEqual(['FOOTER']);
 expect(order.before).toContain('glance-future');
 expect(order.top).toBeGreaterThanOrEqual(order.previousBottom);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
