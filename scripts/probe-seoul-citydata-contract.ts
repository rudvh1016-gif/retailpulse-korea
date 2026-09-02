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
}

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
