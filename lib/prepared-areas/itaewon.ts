import type { AreaMapping } from "../areas";

/**
 * Verified identifiers for a future, separately approved activation.
 * This module is deliberately not imported by the active area registry,
 * collectors, routes or UI. Importing it has no registration side effect.
 * No guessed event centre/radius or station mapping is supplied.
 * Evidence and activation prerequisites: docs/ITAEWON_PREPARATION.md.
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
