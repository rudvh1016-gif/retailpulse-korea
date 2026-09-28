import type { AreaMapping } from "../areas";

/**
 * Verified official identifiers for Itaewon, registered by `lib/areas.ts`.
 * The event centre and subway station live with the other areas' values
 * (lib/areas.ts, lib/subway-ridership.ts).
 * Evidence: docs/ITAEWON_PREPARATION.md.
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
