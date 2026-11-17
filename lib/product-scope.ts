/** Owner-approved airport-only scope. Reversible code policy; no stored data is deleted. */
export const SEOUL_ENABLED = false;
export const SEOUL_ONLY_SOURCES = [
  'seoul_realtime', 'seoul_foreign', 'foreign_purpose_mobility',
  'seoul_sales', 'store_dynamics', 'events', 'population_predictions',
] as const;
export function isSeoulOnlySource(source: string): boolean {
  return (SEOUL_ONLY_SOURCES as readonly string[]).includes(source);
}
export function isSeoulOnlySourceId(sourceId: string): boolean {
  return sourceId.startsWith('SEOUL_') && sourceId !== 'SEOUL_SUBWAY_RIDERSHIP'
    || sourceId === 'KTO_TOURAPI_EVENT';
}
export const SEOUL_DISABLED_RESULT = {
  status: 'SKIPPED_PRODUCT_DISABLED', records: 0, providerRequests: 0, lastGoodPreserved: true,
} as const;
