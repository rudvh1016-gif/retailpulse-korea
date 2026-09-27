/**
 * Read-only probe for the Itaewon values that could not be verified offline
 * (docs/ITAEWON_PREPARATION.md). Prints official identifiers, names, counts
 * and coordinates only — never a key, an authenticated URL or a raw payload.
 * Writes nothing.
 *
 *   SEOUL_OPEN_DATA_KEY=… DATA_GO_KR_SERVICE_KEY=… npx tsx scripts/probe-itaewon-sources.ts
 */
import { buildDataGoKrUrl } from "../lib/data-go-kr.mjs";
import { fetchOfficialJson } from "../lib/source-adapters";
import { kstDayOf, shiftKstDay } from "../lib/kst";
import { seoulForeignPeriodCandidates } from "../lib/collector";

const seoulKey = process.env.SEOUL_OPEN_DATA_KEY ?? "";
const dataGoKrKey = process.env.DATA_GO_KR_SERVICE_KEY ?? "";
const print = (probe: string, value: unknown) => console.log(JSON.stringify({ probe, ...(value as object) }));

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function safely(probe: string, run: () => Promise<void>) {
  try { await run(); } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    let safe = message;
    for (const secret of [seoulKey, dataGoKrKey]) {
      if (secret) safe = safe.replaceAll(secret, "***").replaceAll(encodeURIComponent(secret), "***");
    }
    print(probe, { error: safe.replace(/https?:\/\/\S+/g, "<url>").slice(0, 160) });
  }
}

function seoulRows(payload: unknown, service: string): { code: string; total: number | null; rows: Record<string, unknown>[] } {
  const root = record(record(payload)[service]);
  const result = record(root.RESULT ?? record(payload).RESULT);
  const rows = Array.isArray(root.row) ? root.row.map(record) : [];
  return { code: String(result.CODE ?? "missing"), total: root.list_total_count === undefined ? null : Number(root.list_total_count), rows };
}

const yesterday = shiftKstDay(kstDayOf(new Date().toISOString()), -1).replaceAll("-", "");
const seoul = (path: string) => new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(seoulKey)}/json/${path}`);

// S5 — OA-22723: which station code the provider itself returns for 이태원.
await safely("subway_candidates", async () => {
  for (const code of ["2631", "2632", "2630"]) {
    const payload = await fetchOfficialJson(seoul(`getStnPsgr/1/5/${yesterday}/${code}`), { timeoutMs: 12_000, retries: 0 });
    const items = record(record(record(record(payload).getStnPsgr).response ?? record(payload).response).body).items;
    const item = record(items).item;
    const rows = (Array.isArray(item) ? item : item ? [item] : []).map(record);
    const header = record(record(record(record(payload).getStnPsgr).response ?? record(payload).response).header);
    print("subway_candidate", {
      requested: code, date: yesterday, resultCode: header.resultCode ?? null, rows: rows.length,
      stations: [...new Set(rows.map((row) => `${row.stnCd}|${row.stnNo}|${row.stnNm}|${row.lineNm}`))],
    });
  }
});

// S2 — OA-23018 foreign temporary population: the two Itaewon dongs next to
// Myeongdong's 11140550, which the live collector already reads successfully.
await safely("seoul_foreign", async () => {
  for (const { ymd, tt } of seoulForeignPeriodCandidates(new Date())) {
    const result: Record<string, string> = {};
    for (const dong of ["11140550", "11170650", "11170660"]) {
      const { code, rows } = seoulRows(await fetchOfficialJson(seoul(`Spop250mFornTempDong/1/1000/${ymd}/${tt}/${dong}`), { timeoutMs: 12_000, retries: 0 }), "Spop250mFornTempDong");
      result[dong] = `${code}:${rows.filter((row) => String(row.H_DNG_CD) === dong).length}`;
    }
    const found = Object.values(result).some((value) => value.endsWith(":1"));
    if (found || ymd.endsWith("01")) print("seoul_foreign", { ymd, tt, byDong: result });
    if (found) break;
  }
});

