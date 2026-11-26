"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useChartFillRefresh } from './use-chart-fill-refresh';
import { useAnalyticsConsent } from './analytics-consent';
import { setAnalyticsConsent, trackPageView } from '../lib/personal-analytics';

/** Shared by all public pages; nothing is sent before the visitor's choice or browser default is known (app/analytics-consent.tsx) */
export default function PageAnalytics() {
  useChartFillRefresh();
  const pathname = usePathname();
  const { ready, enabled } = useAnalyticsConsent();
  useEffect(() => {
    if (!ready) return;
    const privatePage=/\/(account|personal-tools-preview)(?:\/|$)/.test(pathname??'');
    setAnalyticsConsent(enabled&&!privatePage);
    if (pathname) trackPageView(pathname);
  }, [ready, enabled, pathname]);
  return null;
}
