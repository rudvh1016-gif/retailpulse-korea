"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAnalyticsConsent } from './analytics-consent';
import { setAnalyticsConsent, trackPageView } from '../lib/personal-analytics';
import { trackOwnPageview } from '../lib/pageviews-client';

/** Shared by all public pages; nothing is sent before the visitor's choice or browser default is known (app/analytics-consent.tsx) */
export default function PageAnalytics() {
  const pathname = usePathname();
  const { ready, enabled } = useAnalyticsConsent();
  useEffect(() => {
    if (!ready) return;
    setAnalyticsConsent(enabled);
    if (pathname) {
      trackPageView(pathname);
      trackOwnPageview(pathname, enabled);
    }
  }, [ready, enabled, pathname]);
  return null;
}

