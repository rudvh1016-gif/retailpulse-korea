import { pathToFileURL } from "node:url";

export interface SeoulCitydataContractProbeResult {
  poiCode: string;
  httpOk: boolean;
  officialCode: string;
  populationBlock: boolean;
  commercialBlock: boolean;
  commercialRequiredFields: boolean;
  categoryArray: boolean;
  paymentCountPublished: boolean;
  paymentAmountRangePublished: boolean;
  areaIdentityFields: boolean;
  commercialTimeFormat: boolean;
  paymentCountShape: NumericFieldShape;
  paymentAmountMinShape: NumericFieldShape;
  paymentAmountMaxShape: NumericFieldShape;
  paymentRangeOrdered: boolean;
}

type NumericFieldShape = "number" | "numeric-string" | "suppressed" | "other";

interface ProbeOptions {
  apiKey: string;
  poiCodes?: readonly string[];
  fetchImpl?: typeof fetch;
  write?: (line: string) => void;
}

const DEFAULT_POI_CODES = ["POI003", "POI007", "POI068"] as const;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim() !== "*";
}

function numericFieldShape(value: unknown): NumericFieldShape {
  if (value === null || value === undefined) return "suppressed";
  if (typeof value === "string" && (!value.trim() || value.trim() === "*")) return "suppressed";
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? "number" : "other";
  if (typeof value !== "string") return "other";
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? "numeric-string" : "other";
}

function numericFieldValue(value: unknown): number | null {
  const shape = numericFieldShape(value);
  if (shape !== "number" && shape !== "numeric-string") return null;
  return Number(typeof value === "string" ? value.replaceAll(",", "").trim() : value);
}

function kstMinuteFormat(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return false;
  return !Number.isNaN(Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+09:00`));
}

/**
 * Reads only the OA-21285 integrated response contract. Diagnostics contain
 * booleans and official status codes, never the authenticated URL or values.
 */
export async function probeSeoulCitydataContracts(options: ProbeOptions): Promise<SeoulCitydataContractProbeResult[]> {
  if (!options.apiKey.trim()) throw new Error("seoul_contract_probe_key_missing");
  const poiCodes = options.poiCodes ?? DEFAULT_POI_CODES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const write = options.write ?? console.log;
  const results: SeoulCitydataContractProbeResult[] = [];

  for (const poiCode of poiCodes) {
    const url = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(options.apiKey)}/json/citydata/1/5/${poiCode}`);
    let response: Response;
    let payload: unknown;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
      payload = await response.json();
    } catch {
      const failed: SeoulCitydataContractProbeResult = {
        poiCode,
        httpOk: false,
        officialCode: "REQUEST_ERROR",
        populationBlock: false,
        commercialBlock: false,
        commercialRequiredFields: false,
        categoryArray: false,
        paymentCountPublished: false,
        paymentAmountRangePublished: false,
        areaIdentityFields: false,
        commercialTimeFormat: false,
        paymentCountShape: "other",
        paymentAmountMinShape: "other",
        paymentAmountMaxShape: "other",
        paymentRangeOrdered: false,
      };
      write(JSON.stringify(failed));
      throw new Error(`seoul_contract_probe_failed_${poiCode}_REQUEST_ERROR`);
    }

    const root = objectRecord(payload);
    const official = objectRecord(root?.RESULT);
    const officialCode = String(official?.["RESULT.CODE"] ?? official?.CODE ?? "missing");
    const citydata = objectRecord(root?.CITYDATA);
    const population = Array.isArray(citydata?.LIVE_PPLTN_STTS) ? citydata.LIVE_PPLTN_STTS : [];
    const commercial = objectRecord(citydata?.LIVE_CMRCL_STTS);
    const paymentAmountMin = numericFieldValue(commercial?.AREA_SH_PAYMENT_AMT_MIN);
    const paymentAmountMax = numericFieldValue(commercial?.AREA_SH_PAYMENT_AMT_MAX);
    const result: SeoulCitydataContractProbeResult = {
      poiCode,
      httpOk: response.ok,
      officialCode,
      populationBlock: population.length > 0 && objectRecord(population[0]) !== null,
      commercialBlock: commercial !== null,
      commercialRequiredFields: Boolean(
        commercial
        && present(commercial.AREA_CMRCL_LVL)
        && present(commercial.CMRCL_TIME),
      ),
      categoryArray: Array.isArray(commercial?.CMRCL_RSB),
      paymentCountPublished: present(commercial?.AREA_SH_PAYMENT_CNT),
      paymentAmountRangePublished: present(commercial?.AREA_SH_PAYMENT_AMT_MIN)
        && present(commercial?.AREA_SH_PAYMENT_AMT_MAX),
      areaIdentityFields: Boolean(citydata && present(citydata.AREA_CD) && present(citydata.AREA_NM)),
      commercialTimeFormat: kstMinuteFormat(commercial?.CMRCL_TIME),
      paymentCountShape: numericFieldShape(commercial?.AREA_SH_PAYMENT_CNT),
      paymentAmountMinShape: numericFieldShape(commercial?.AREA_SH_PAYMENT_AMT_MIN),
      paymentAmountMaxShape: numericFieldShape(commercial?.AREA_SH_PAYMENT_AMT_MAX),
      paymentRangeOrdered: paymentAmountMin !== null && paymentAmountMax !== null && paymentAmountMin <= paymentAmountMax,
    };
    results.push(result);
    write(JSON.stringify(result));

    if (!result.httpOk || officialCode !== "INFO-000" || !result.populationBlock
      || !result.commercialBlock || !result.commercialRequiredFields || !result.categoryArray) {
      throw new Error(`seoul_contract_probe_failed_${poiCode}_${officialCode}`);
    }
  }

  return results;
}

async function main(): Promise<void> {
  await probeSeoulCitydataContracts({ apiKey: process.env.SEOUL_OPEN_DATA_KEY ?? "" });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "seoul_contract_probe_failed");
    process.exitCode = 1;
  });
}
