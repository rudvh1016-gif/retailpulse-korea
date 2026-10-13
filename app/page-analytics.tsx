"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAnalyticsConsent } from './analytics-consent';
import { setAnalyticsConsent, trackPageView } from '../lib/personal-analytics';

/** Shared by all public pages, with no tag or event before explicit opt-in */
export default function PageAnalytics() {
  const pathname = usePathname();
  const { ready, enabled } = useAnalyticsConsent();
  useEffect(() => {
    if (!ready) return;
    setAnalyticsConsent(enabled);
    if (pathname) trackPageView(pathname);
  }, [ready, enabled, pathname]);
  return null;
}
