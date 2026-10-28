import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

for(const width of [320,1440])test(`airport navigation is identifiable and usable at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/airport');
 const terminals=page.getByRole('tablist',{name:'터미널 선택'});
 await expect(terminals).toBeVisible();
 await expect(page.getByText('공항 정보 선택',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath(`airport-menu-${width}.png`)});
 const t2=terminals.getByRole('tab',{name:'T2',exact:true});
 await expect(t2).toHaveCSS('cursor','pointer');
 if(width>700){await t2.hover();await expect(t2).toHaveCSS('background-color','rgb(244, 246, 248)');}
 await t2.click();await expect(t2).toHaveAttribute('aria-selected','true');
 const sections=page.getByRole('navigation',{name:'공항 정보 구분'});
 await sections.getByRole('button',{name:'항공편',exact:true}).click();
 await expect(sections.getByRole('button',{name:'항공편',exact:true})).toHaveAttribute('aria-current','page');
 const news=page.getByTestId('airport-customs-news-entry');
 // The news entry belongs to the departure view, so select it before testing the link.
 await sections.getByRole('button',{name:'출국',exact:true}).click();
 await expect(news).toHaveAttribute('href','/ko/airport-news');
 await expect(news.locator('[aria-hidden="true"]').first()).toHaveCSS('color','rgb(52, 91, 123)');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
