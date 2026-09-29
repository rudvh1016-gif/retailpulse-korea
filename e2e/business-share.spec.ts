import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { shareCopy } from '../lib/prep-share';

async function open(page: Page, lang = 'ko', width = 390) {
  await page.setViewportSize({ width, height: 900 });
  let summaryRequests = 0;
  await page.route('**/api/live/summary*', async (route) => { summaryRequests += 1; await routeSummary(SUMMARY_FIXTURE)(route); });
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(`/${lang}/business`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const share = page.getByTestId('prep-share');
  await expect(share).toBeVisible();
  return { share, requests: () => summaryRequests };
}

test('copying puts the same dated text on the clipboard without a new data request', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { share, requests } = await open(page);
  const before = requests();
  await share.getByRole('button', { name: shareCopy.copy.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.copied.ko);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('[KORETAIL]');
  expect(copied).toContain('2026-08-31 (월) · 명동');
  expect(copied).toContain('/ko/business?date=2026-08-31');
  expect(copied).toContain('17:00–18:00');
  expect(copied).not.toContain('지금');
  expect(requests()).toBe(before);
});

test('a refused clipboard shows selectable text instead of a false success', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } });
  });
  const { share } = await open(page);
  await share.getByRole('button', { name: shareCopy.copy.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.copyFailed.ko);
  await expect(share.getByTestId('share-fallback')).toHaveValue(/\[KORETAIL\]/);
});

for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
  test(`the one-page image downloads as a real PNG, ${lang}`, async ({ page }) => {
    const { share, requests } = await open(page, lang);
    const before = requests();
    const download = page.waitForEvent('download');
    await share.getByRole('button', { name: shareCopy.image[lang] }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('koretail-2026-08-31-myeongdong.png');
    await file.saveAs(test.info().outputPath(`share-${lang}.png`));
    const bytes = await readFile(await file.path());
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(600);
    await expect(share.getByTestId('share-status')).toHaveText(shareCopy.imageReady[lang]);
    expect(requests()).toBe(before);
  });
}

test('an image that cannot be encoded is reported and the text is offered', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
  });
  const { share } = await open(page);
  await share.getByRole('button', { name: shareCopy.image.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.imageFailed.ko);
  await expect(share.getByTestId('share-fallback')).toBeVisible();
});

test('the share sheet reports a choice or a cancel, never a delivery', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => (calls++ === 0 ? Promise.resolve() : Promise.reject(new DOMException('cancel', 'AbortError'))) });
  });
  const { share } = await open(page);
  await share.getByRole('button', { name: shareCopy.share.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.shareChosen.ko);
  await share.getByRole('button', { name: shareCopy.share.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.shareCancelled.ko);
});

test('the share block fits a 360px phone', async ({ page }) => {
  const { share } = await open(page, 'ko', 360);
  await share.locator('summary').click();
  await expect(share.getByTestId('share-preview')).toContainText('[KORETAIL]');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
