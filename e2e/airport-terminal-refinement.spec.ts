import { expect, test, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';

async function openAirport(page: Page, lang = 'ko') {
  await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/flights*', route => route.fulfill({ json: { mode: 'live-flights', flights: [], truncated: false } }));
  await page.goto(`/${lang}/airport?terminal=T2`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  return page.locator('.app[data-hydrated="true"] main #airport-data-flow');
}

for (const lang of ['ko', 'en', 'zh', 'ja']) for (const width of [320, 390, 1280]) {
  test(`terminal refinement remains legible and selected ${lang} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 });
    const rail = await openAirport(page, lang);
    const choices = rail.getByRole('tab');
    await expect(choices).toHaveCount(4);
    // Missing secondary labels or a color-only selection must fail this test.
    await expect(choices.locator('.terminal-choice-description')).toHaveCount(4);
    await expect(rail.getByRole('tab', { name: 'T2', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(rail.locator('[aria-selected="true"] .terminal-choice-check')).toBeVisible();
    await expect(rail.locator('[aria-selected="false"] .terminal-choice-check:visible')).toHaveCount(0);
    for (const choice of await choices.all()) {
      const box = await choice.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(await choice.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await expect(choice).toHaveAccessibleDescription(await choice.locator('.terminal-choice-description').innerText());
    }
    if (lang === 'en') {
      const title = choices.last().locator('.terminal-choice-title');
      const label = await title.evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); return { height: range.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(node).lineHeight) }; });
      expect(label.height).toBeLessThanOrEqual(label.lineHeight + 1);
    }
    const sizes = await choices.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
    for (const size of sizes) expect(size).toBeCloseTo(sizes[0], 1);
    await expect(choices.nth(2)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(choices.nth(2)).toHaveCSS('box-shadow', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await rail.screenshot({ path: info.outputPath(`terminal-${lang}-${width}.png`) });
    if (lang === 'ko') await page.screenshot({ path: info.outputPath(`airport-${width}.png`) });
  });
}

test('terminal choices retain pointer, keyboard, repeated selection and browser history behavior', async ({ page }) => {
  const rail = await openAirport(page);
  const choices = rail.getByRole('tab');
  await choices.nth(2).focus();
  await expect(choices.nth(2)).toHaveCSS('outline-style', 'solid');
  await choices.nth(2).press('ArrowLeft');
  await expect(choices.nth(1)).toBeFocused();
  await expect(choices.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/terminal=T1/);
  await choices.nth(1).press('End');
  await expect(choices.nth(3)).toBeFocused();
  await expect(choices.nth(3)).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/building=CONCOURSE/);
  await expect(page.locator('.airport-context-nav')).toHaveCount(0);
  await choices.nth(3).press('Home');
  await expect(choices.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.airport-context-nav')).toBeVisible();
  await choices.nth(0).press('ArrowLeft');
  await expect(choices.nth(3)).toHaveAttribute('aria-selected', 'true');
  await choices.nth(3).press('ArrowRight');
  await expect(choices.nth(0)).toHaveAttribute('aria-selected', 'true');
  await choices.nth(1).focus();
  await choices.nth(1).press('Enter');
  await expect(choices.nth(1)).toHaveAttribute('aria-selected', 'true');
  await choices.nth(0).focus();
  await choices.nth(0).press('Space');
  await expect(choices.nth(0)).toHaveAttribute('aria-selected', 'true');
  await choices.nth(2).click();
  const selectedUrl = page.url();
  await choices.nth(2).click();
  await expect(page).toHaveURL(selectedUrl);
  await expect(rail.locator('[aria-selected="true"]')).toHaveCount(1);
  await page.goBack();
  await expect(choices.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(choices.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(rail.locator('[tabindex="0"]')).toHaveCount(1);
});

for (const lang of ['ko', 'en', 'zh', 'ja']) test(`every terminal scope fits larger text and forced colors ${lang}`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 950 });
  const rail = await openAirport(page, lang);
  for (const enlarged of [false, true]) {
    if (enlarged) await page.addStyleTag({ content: '#airport-data-flow button { font-size: 24px !important } #airport-data-flow .terminal-choice-description { font-size:20px !important }' });
    for (const choice of await rail.getByRole('tab').all()) {
      await choice.click();
      await expect(choice).toHaveAttribute('aria-selected', 'true');
      expect(await choice.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const target = await choice.boundingBox();
      const check = await choice.locator('.terminal-choice-check').boundingBox();
      expect(check!.x).toBeGreaterThanOrEqual(target!.x);
      expect(check!.x + check!.width).toBeLessThanOrEqual(target!.x + target!.width);
      expect(check!.y).toBeGreaterThanOrEqual(target!.y);
      expect(check!.y + check!.height).toBeLessThanOrEqual(target!.y + target!.height);
    }
  }
  await page.emulateMedia({ forcedColors: 'active' });
  const selected = rail.locator('[aria-selected="true"]');
  // Pointer focus deliberately has no focus-visible ring. Enter keyboard modality
  // and move to the first choice before checking the forced-colors focus rule.
  await selected.press('Home');
  await expect(selected).toBeFocused();
  await expect(selected).toHaveCSS('outline-style', 'solid');
  await expect(selected.locator('.terminal-choice-check')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
