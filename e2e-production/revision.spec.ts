import {test,expect} from '@playwright/test';
import {expectedRevision} from '../scripts/production-revision-setup.mjs';
for(const width of [390,1440])test(`hydrated public screen carries the deployed revision ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await page.goto('/ko');
 await expect(page.locator('meta[name="koretail-build-sha"]')).toHaveAttribute('content',expectedRevision());
 await expect(page.locator('meta[name="koretail-build-dirty"]')).toHaveAttribute('content','false');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
});
