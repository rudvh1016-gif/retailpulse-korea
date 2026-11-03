import type { Lang } from '../app/retailpulse-data';

export type SiteShareResult = 'shared' | 'cancelled' | 'copied' | 'manual';
type ShareBrowser = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

/** Share the public locale home, never this device's filters or personal settings. */
export function siteShareUrl(origin: string, lang: Lang): string {
  return new URL(`/${lang}`, origin).href;
}

export async function copySiteLink(url: string, browser: ShareBrowser): Promise<SiteShareResult> {
  try {
    if (!browser.clipboard?.writeText) return 'manual';
    await browser.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}

/** Called directly from a click so native sharing retains transient activation. */
export async function shareSiteLink(data: ShareData & { url: string }, browser: ShareBrowser): Promise<SiteShareResult> {
  if (typeof browser.share === 'function') {
    try {
      await browser.share(data);
      return 'shared';
    } catch (error) {
      // Dismissing the system sheet must not silently overwrite the clipboard.
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled';
    }
  }
  return copySiteLink(data.url, browser);
}
