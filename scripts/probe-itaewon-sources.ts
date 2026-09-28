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

// S6 — OA-15577 store dynamics for trade area 3001491 (exact filter supported).
await safely("store_dynamics", async () => {
  const year = Number(yesterday.slice(0, 4));
  const quarter = Math.ceil(Number(yesterday.slice(4, 6)) / 3);
  for (let i = 0; i < 6; i += 1) {
    const q = quarter - i;
    const code = `${q > 0 ? year : year - 1}${q > 0 ? q : q + 4}`;
    const { code: result, total, rows } = seoulRows(await fetchOfficialJson(seoul(`VwsmTrdarStorQq/1/5/${code}/3001491`), { timeoutMs: 30_000, retries: 0 }), "VwsmTrdarStorQq");
    print("store_dynamics", { quarter: code, result, total, tradeArea: rows[0] ? `${rows[0].TRDAR_CD}|${rows[0].TRDAR_CD_NM}|${rows[0].TRDAR_SE_CD}|${rows[0].TRDAR_SE_CD_NM}` : null });
    if (rows.length) break;
  }
});

// S3 — OA-15572 estimated sales: the quarter filter only, so sweep and look for 3001491.
await safely("estimated_sales", async () => {
  const year = Number(yesterday.slice(0, 4));
  const quarter = Math.ceil(Number(yesterday.slice(4, 6)) / 3);
  for (let i = 0; i < 6; i += 1) {
    const q = quarter - i;
    const code = `${q > 0 ? year : year - 1}${q > 0 ? q : q + 4}`;
    const first = seoulRows(await fetchOfficialJson(seoul(`VwsmTrdarSelngQq/1/1/${code}`), { timeoutMs: 30_000, retries: 0 }), "VwsmTrdarSelngQq");
    if (!first.rows.length) continue;
    const pages = Math.min(25, Math.ceil((first.total ?? 0) / 1000));
    const matches = new Map<string, number>();
    for (let page = 0; page < pages; page += 1) {
      const { rows } = seoulRows(await fetchOfficialJson(seoul(`VwsmTrdarSelngQq/${page * 1000 + 1}/${page * 1000 + 1000}/${code}`), { timeoutMs: 30_000, retries: 0 }), "VwsmTrdarSelngQq");
      for (const row of rows) {
        if (["3001491", "3001492"].includes(String(row.TRDAR_CD))) {
          const key = `${row.TRDAR_CD}|${row.TRDAR_CD_NM}|${row.TRDAR_SE_CD}`;
          matches.set(key, (matches.get(key) ?? 0) + 1);
        }
      }
    }
    print("estimated_sales", { quarter: code, total: first.total, pages, industryRowsByTradeArea: Object.fromEntries(matches) });
    break;
  }
});

// W1 — KMA grid 60,126 answers like the three existing grids.
await safely("kma_grid", async () => {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  const baseHours = [23, 20, 17, 14, 11, 8, 5, 2];
  const hour = kst.getUTCHours() - 1;
  const base = baseHours.find((h) => h <= hour) ?? 23;
  const baseDate = base === 23 && hour < 23 ? shiftKstDay(kstDayOf(new Date().toISOString()), -1) : kstDayOf(new Date().toISOString());
  const url = buildDataGoKrUrl("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst", dataGoKrKey,
    { pageNo: "1", numOfRows: "20", dataType: "JSON", base_date: baseDate.replaceAll("-", ""), base_time: `${String(base).padStart(2, "0")}00`, nx: "60", ny: "126" });
  const payload = record(await fetchOfficialJson(url, { timeoutMs: 12_000, retries: 0 }));
  const response = record(payload.response);
  const body = record(response.body);
  print("kma_grid", { nx: 60, ny: 126, resultCode: record(response.header).resultCode ?? null, totalCount: body.totalCount ?? null });
});

// T1 — TourAPI's own coordinate for the tourism special zone, for the event centre.
await safely("tourapi_place", async () => {
  const url = buildDataGoKrUrl("https://apis.data.go.kr/B551011/KorService2/searchKeyword2", dataGoKrKey,
    { MobileOS: "ETC", MobileApp: "KORETAIL", _type: "json", numOfRows: "30", pageNo: "1", keyword: "이태원", lDongRegnCd: "11" });
  const payload = record(await fetchOfficialJson(url, { timeoutMs: 12_000, retries: 0 }));
  const response = record(payload.response);
  const items = record(record(response.body).items).item;
  const rows = (Array.isArray(items) ? items : items ? [items] : []).map(record);
  print("tourapi_place", {
    resultCode: record(response.header).resultCode ?? null,
    places: rows.map((row) => ({ contentId: row.contentid, type: row.contenttypeid, title: row.title, mapy: row.mapy, mapx: row.mapx, addr: row.addr1 })),
  });
  // The same query also names the three existing areas' zones, for comparison.
  for (const keyword of ["명동", "홍대", "성수"]) {
    const other = record(await fetchOfficialJson(buildDataGoKrUrl("https://apis.data.go.kr/B551011/KorService2/searchKeyword2", dataGoKrKey,
      { MobileOS: "ETC", MobileApp: "KORETAIL", _type: "json", numOfRows: "10", pageNo: "1", keyword, lDongRegnCd: "11", contentTypeId: "12" }), { timeoutMs: 12_000, retries: 0 }));
    const otherItems = record(record(record(other.response).body).items).item;
    const otherRows = (Array.isArray(otherItems) ? otherItems : otherItems ? [otherItems] : []).map(record);
    print("tourapi_reference", { keyword, places: otherRows.map((row) => ({ title: row.title, mapy: row.mapy, mapx: row.mapx })) });
  }
});
