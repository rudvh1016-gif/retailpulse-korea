export const S2_SERVICE_NAME = "Spop250mFornTempDong";
export const S2_SOURCE_ID = "S2_SEOUL_FOREIGN_LIVING_POPULATION";

function listify(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

function safeFailure(reason) {
  return {
    sourceId: S2_SOURCE_ID,
    authStatus: "REQUEST_ERROR",
    format: "json",
    officialResultCode: null,
    recordCount: 0,
    firstRecordFieldNames: [],
    reason,
  };
}

export async function runSeoulS2Smoke({ key, fetcher = fetch }) {
  if (!key) {
    return {
      sourceId: S2_SOURCE_ID,
      authStatus: "AUTH_BLOCKED",
      format: "json",
      officialResultCode: null,
      recordCount: 0,
      firstRecordFieldNames: [],
      reason: "SEOUL_OPEN_DATA_KEY missing",
    };
  }

  try {
    const url = `http://openapi.seoul.go.kr:8088/${key}/json/${S2_SERVICE_NAME}/1/5/`;
    const response = await fetcher(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return safeFailure("S2 returned non-JSON content");
    }
    const service = payload?.[S2_SERVICE_NAME] ?? {};
    const result = service.RESULT ?? payload?.RESULT ?? {};
    const code = result.CODE ?? result["RESULT.CODE"] ?? null;
    const rows = listify(service.row);
    return {
      sourceId: S2_SOURCE_ID,
      authStatus: response.ok && code === "INFO-000" ? "PASS" : "AUTH_BLOCKED",
      format: "json",
      officialResultCode: code,
      recordCount: rows.length,
      firstRecordFieldNames: Object.keys(rows[0] ?? {}).sort(),
    };
  } catch (error) {
    return safeFailure(error instanceof Error ? error.name : "fetch_failed");
  }
}
