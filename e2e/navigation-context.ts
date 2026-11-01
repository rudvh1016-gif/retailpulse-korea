import { expect, type Locator, type Page } from '@playwright/test';

type ExpectedQuery = Record<string, string | null>;

/** Compare the destination and chosen context independently of query ordering. */
export async function expectNavigationHref(page: Page, link: Locator, pathname: string, query: ExpectedQuery) {
  await expect.poll(async () => {
    const href = await link.getAttribute('href');
    if (href === null) return null;
    const url = new URL(href, page.url());
    return { pathname: url.pathname, ...Object.fromEntries(Object.keys(query).map(key => [key, url.searchParams.get(key)])) };
  }).toEqual({ pathname, ...query });
}

export async function expectNavigationUrl(page: Page, pathname: string, query: ExpectedQuery) {
  await expect(page).toHaveURL(url => url.pathname === pathname
    && Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value));
}
