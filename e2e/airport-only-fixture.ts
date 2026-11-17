import { expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';

/** A full historic payload must not reactivate retired product views. */
export async function airportOnlyFixture(page: Page, failedSummary = false, payload: unknown = SUMMARY_FIXTURE) {
 const errors: string[] = [], retiredReads: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.route('**/api/live/summary*', failedSummary ? route => route.abort('failed') : routeSummary(payload));
 await page.route(/\/api\/live\/(predictions|commercial-months|usual|events)(?:\?|$)/, route => {
  retiredReads.push(route.request().url());
  return route.fulfill({ status: 410, json: { status: 'RETIRED' } });
 });
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 return { errors, retiredReads };
}
export async function expectAirportOnly(page: Page, locale: string, destination = '') {
 await expect(page).toHaveURL(new RegExp(`/${locale}${destination}/?$`));
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
 await expect(page.locator('.district-choice,.consumption-results,.prediction-history,.tourism-desk,.outlook-grid,[data-testid="population-outlook"],[data-testid="seoul-flow-models"]')).toHaveCount(0);
 await expect(page.locator('.top-nav:visible,.bottom-nav:visible')).toHaveCount(1);
 for (const shell of await page.locator('.top-nav,.bottom-nav,.site-footer').all()) await expect(shell).not.toContainText(/명동|홍대|성수|이태원|서울|Myeongdong|Hongdae|Seoul|首尔|ソウル/);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
