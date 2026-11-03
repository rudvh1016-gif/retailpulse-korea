import { expect, test, type Page } from '@playwright/test';

type Capture = { shares: ShareData[]; copies: string[]; mode: string; resolve?: () => void };
declare global { interface Window { siteShareCapture: Capture } }
async function prepare(page: Page, mode = 'unsupported', copyFails = false) {
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'fixture unavailable' } }));
  await page.addInitScript(({ mode, copyFails }) => {
    const capture: Capture = { shares: [], copies: [], mode };
    window.siteShareCapture = capture;
    Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'unsupported' ? undefined : async (data: ShareData) => {
      capture.shares.push(data);
      if (capture.mode === 'cancel') throw new DOMException('cancelled', 'AbortError');
      if (capture.mode === 'denied') throw new DOMException('denied', 'NotAllowedError');
      if (capture.mode === 'pending') await new Promise<void>(resolve => { capture.resolve = resolve; });
    } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(value: string) {
      if (copyFails) throw new DOMException('denied', 'NotAllowedError');
      capture.copies.push(value);
    } } });
  }, { mode, copyFails });
}

for (const width of [320, 390, 1440]) for (const locale of ['ko', 'en', 'zh', 'ja']) {
  test(`share sits above settings and copies a clean locale link ${locale} ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    await page.goto(`/${locale}/more?terminal=T2&email=private#settings`, { waitUntil: 'domcontentloaded' });
    const share = page.getByTestId('site-share');
    await expect(share).toBeVisible();
    const bounds = await share.boundingBox(), intro = await page.locator('.more-view > .view-intro').boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(intro!.y + 1);
    const button = share.getByRole('button').first();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (locale === 'ko' && width !== 320) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath(`more-share-initial-${width}.png`), fullPage: false });
    }
    await button.focus(); await expect(button).toBeFocused(); await page.keyboard.press('Enter');
    await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'copied');
    const link = await share.getByRole('textbox').inputValue();
    const parsed = new URL(link);
    expect(parsed.origin).toBe(new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:4173').origin);
    expect(parsed.pathname).toBe(`/${locale}`); expect(parsed.search).toBe(''); expect(parsed.hash).toBe('');
    expect(await page.evaluate(() => window.siteShareCapture.copies)).toEqual([link]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await share.getByRole('button').last().click();
    expect(await page.evaluate(() => window.siteShareCapture.copies.length)).toBe(2);
    if (locale === 'ko' && width !== 320) await page.screenshot({ path: testInfo.outputPath(`more-share-${width}.png`), fullPage: false });
  });
}

test('native sharing opens once, cancellation does not copy, and a later retry works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page, 'cancel');
  await page.goto('/ko/more', { waitUntil: 'domcontentloaded' });
  const share = page.getByTestId('site-share'), primary = share.getByRole('button').first();
  await primary.click();
  await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'cancelled');
  expect(await page.evaluate(() => window.siteShareCapture.copies)).toEqual([]);
  await page.evaluate(() => { window.siteShareCapture.mode = 'pending'; });
  await primary.click(); await expect(primary).toBeDisabled();
  await primary.evaluate(button => { (button as HTMLButtonElement).click(); });
  expect(await page.evaluate(() => window.siteShareCapture.shares.length)).toBe(2);
  await page.evaluate(() => { window.siteShareCapture.resolve?.(); });
  await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'shared');
  await expect(primary).toBeEnabled();
  const data = await page.evaluate(() => window.siteShareCapture.shares[1]);
  expect(data.title).toBe('KORETAIL'); expect(new URL(data.url!).pathname).toBe('/ko');
  await share.getByRole('button').last().click();
  expect(await page.evaluate(() => window.siteShareCapture.copies)).toEqual([data.url]);
});

for (const native of ['unsupported', 'denied']) test(`copy failure exposes a selectable link without false success (${native})`, async ({ page }) => {
  await prepare(page, native, true); await page.goto('/ko/more', { waitUntil: 'domcontentloaded' });
  const share = page.getByTestId('site-share'); await share.getByRole('button').first().click();
  await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'manual');
  const input = share.getByRole('textbox'); await input.focus();
  expect(await input.evaluate(node => { const input = node as HTMLInputElement; return input.selectionEnd! - input.selectionStart!; })).toBe((await input.inputValue()).length);
  expect(await page.evaluate(() => window.siteShareCapture.copies)).toEqual([]);
});

test('native permission failure falls back to copying', async ({ page }) => {
  await prepare(page, 'denied'); await page.goto('/ko/more', { waitUntil: 'domcontentloaded' });
  const share = page.getByTestId('site-share'); await share.getByRole('button').first().click();
  await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'copied');
});

test('navigation away and back resets a pending share and preserves the More screen', async ({ page }) => {
  await prepare(page, 'pending'); await page.goto('/ko/more', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('site-share').getByRole('button').first().click();
  await page.locator('.more-section-links a[href="/ko/about"]').click();
  await expect(page.getByTestId('site-share')).toHaveCount(0);
  await page.evaluate(() => { window.siteShareCapture.resolve?.(); });
  await page.goBack();
  await expect(page.getByTestId('site-share').getByRole('button').first()).toBeEnabled();
  await expect(page.locator('.more-view h1')).toBeVisible();
});

test('a language change discards the old pending result and shares the new locale', async ({ page }) => {
  await prepare(page, 'pending'); await page.goto('/ko/more', { waitUntil: 'domcontentloaded' });
  const share = page.getByTestId('site-share');
  await share.getByRole('button').first().click();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('en');
  await expect(share.getByRole('button', { name: 'Share', exact: true })).toBeEnabled();
  await page.evaluate(() => { window.siteShareCapture.resolve?.(); window.siteShareCapture.mode = 'success'; });
  await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'idle');
  await share.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'shared');
  expect(new URL(await share.getByRole('textbox').inputValue()).pathname).toBe('/en');
});

test('desktop fallback writes the actual browser clipboard and the copied link opens the locale home', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'fixture unavailable' } }));
  // Disable only native sharing: the real Clipboard API must perform this write.
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  await page.goto('/ko/more?terminal=T2#settings', { waitUntil: 'domcontentloaded' });
  const share = page.getByTestId('site-share');
  await share.getByRole('button').first().click();
  await expect(share.locator('[role="status"]')).toHaveAttribute('data-status', 'copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await share.getByRole('textbox').inputValue());
  expect(new URL(copied).pathname).toBe('/ko');
  expect(new URL(copied).search).toBe('');
  expect(new URL(copied).hash).toBe('');
  const destination = new URL(copied);
  await page.goto(`${destination.pathname}${destination.search}${destination.hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toBeVisible();
  await expect(page).toHaveURL(/\/ko$/);
  await expect(page.getByTestId('site-share')).toHaveCount(0);
});
