import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

test('a stalled flight board request ends as a failed load, not zero flights',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/flights*',async route=>{await held;await route.abort().catch(()=>{});});
 try {
  await page.goto('/en/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.locator('.airport-context-nav').getByRole('button',{name:'FLIGHTS',exact:true}).click();
  const board=page.locator('.flight-board');await expect(board).toContainText('Loading, please wait.');
  await expect(board).toContainText('Could not load data. Please refresh shortly.',{timeout:20000});
  await expect(board).not.toContainText('Loading, please wait.');
  await expect(board).not.toContainText('No flight record is stored for this date.');
 } finally {release();}
});
