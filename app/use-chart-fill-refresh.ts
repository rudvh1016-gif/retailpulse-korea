'use client';
import {useEffect} from 'react';
import {observeChartFillVisibility} from '../lib/chart-fill-visibility';

/** Values stay final; existing chart effects wait for their first visible view and replay on updates. */
export function useChartFillRefresh() {
  useEffect(observeChartFillVisibility, []);
}
