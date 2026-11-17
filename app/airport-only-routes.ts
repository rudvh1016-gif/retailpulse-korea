/** Retired Seoul routes resolve before any source reads or client view mounts. */
export const retiredSeoulSlugs = ["myeongdong", "hongdae", "seongsu", "itaewon", "today", "where-to", "consumption", "predictions", "tourism-desk", "forecast"] as const;
export function airportOnlyDestination(locale: string, slug: string): string | null {
  if (!(retiredSeoulSlugs as readonly string[]).includes(slug)) return null;
  return `/${locale}`;
}
