import type { AreaMapping } from "../areas";

/**
 * Verified official identifiers for Itaewon.
 * `lib/areas.ts` registers them; which sources actually read Itaewon is
 * decided there (`realtimeAreaIds`, `publicAreaIds`), one source at a time.
 * No guessed event centre/radius or station mapping is supplied.
 * Evidence and activation stages: docs/ITAEWON_PREPARATION.md.
 */
export const itaewonPreparation = {
  seoulPoiCode: "POI004",
  seoulPoiName: "이태원 관광특구",
  salesTradeArea: { code: "3001491", name: "이태원 관광특구", seCd: "U" },
  seoulAdministrativeDongCodes: ["11170650", "11170660"],
  kmaGrid: { nx: 60, ny: 126 },
} satisfies Pick<AreaMapping,
  "seoulPoiCode" | "seoulPoiName" | "salesTradeArea" |
  "seoulAdministrativeDongCodes" | "kmaGrid"
>;
