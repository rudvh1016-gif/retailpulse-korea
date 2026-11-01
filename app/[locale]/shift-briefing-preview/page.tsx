import { notFound } from 'next/navigation';
import ShiftBriefingPreview from '../../shift-briefing-preview';
import type { Lang } from '../../retailpulse-data';
import { SHIFT_PREVIEW_MOBILE_SIZES, type ShiftPreviewMobileSize, type ShiftPreviewState, type ShiftPreviewWidth } from '../../../lib/shift-briefing-preview-data';

export const metadata = {
  title: 'KORETAIL · 내 근무 브리핑 디자인 확인',
  robots: { index: false, follow: false, noarchive: true },
};

export default async function Page({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // This fixture surface is for local review only, never a public data page.
  if (process.env.NODE_ENV === 'production') notFound();
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!['ko', 'en', 'zh', 'ja'].includes(locale)) notFound();
  const state = typeof query.state === 'string' && ['first', 'saved', 'unchanged', 'missing', 'partial'].includes(query.state)
    ? query.state as ShiftPreviewState : 'saved';
  const width: ShiftPreviewWidth = query.width === 'mobile' ? 'mobile' : 'desktop';
  const size=Number(query.size);
  const mobileSize=SHIFT_PREVIEW_MOBILE_SIZES.includes(size as ShiftPreviewMobileSize)?size as ShiftPreviewMobileSize:390;
  return <ShiftBriefingPreview lang={locale as Lang} initialState={state} initialWidth={width} initialFocus={query.focus==='briefing'} initialMobileSize={mobileSize} initialLongDestinations={query.names==='long'}/>;
}
