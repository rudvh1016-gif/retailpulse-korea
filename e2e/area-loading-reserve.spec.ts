import {test,expect} from '@playwright/test';

// While LiveSignals waits for the summary, a Seoul area page keeps its footer below the fold
// (app/globals.css), so the content landing later does not push the footer down (CLS 0.29 → 0.01).
// Only the loading line is reserved; the failed-summary line (aria-busy="false") keeps its own height.
for(const [width,height] of [[390,844],[1280,800]] as const)test(`area page keeps the footer below the fold while the summary loads ${width}`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.route('**/api/live/summary*',()=>{});
 await page.goto('/ko/myeongdong');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.page-shell > .area-tabs ~ .airport-empty-line[aria-busy="true"]')).toBeVisible();
 expect(await page.locator('footer.site-footer').evaluate(footer=>Math.round(footer.getBoundingClientRect().top)-innerHeight)).toBeGreaterThanOrEqual(0);
});
