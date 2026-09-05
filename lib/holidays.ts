import { buildDataGoKrUrl } from './data-go-kr.mjs';
import { fetchOfficialJson } from './source-adapters';
import { sha256 } from './hash';
import { isValidKstDay, kstDayOf } from './kst';
export interface Holiday { date: string; name: string }
export function normalizeHolidays(payload: unknown, month: string): Holiday[] {
  const value = payload as {response?: {header?:{resultCode?:unknown};body?:{totalCount?:unknown;items?:{item?:unknown}|string}}};
  if (String(value?.response?.header?.resultCode) !== '00') throw new Error(`holiday_provider_${String(value?.response?.header?.resultCode??'missing').replace(/[^0-9]/g,'').slice(0,4)||'invalid'}`);
  const body = value.response?.body;
  const total = Number(body?.totalCount);
  if (!Number.isSafeInteger(total) || total < 0 || total > 100) throw new Error('holiday_incomplete_response');
  const raw = typeof body?.items === 'object' ? body.items?.item : undefined;
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (rows.length !== total) throw new Error('holiday_incomplete_response');
  const result: Holiday[] = [];
  for (const row of rows) {
    const date = String(row.locdate).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    if (!isValidKstDay(date) || !date.startsWith(month) || typeof row.dateName !== 'string' || !['Y','N'].includes(row.isHoliday)) throw new Error('holiday_invalid_row');
    if (row.isHoliday === 'Y') result.push({date,name:row.dateName.slice(0,100)});
  }
  return result;
}
/** Existing daily Actions runner only. One current and one next month; daily cache. */
export async function collectHolidays(db: D1Database, key: string | undefined, now = new Date()) {
  if (!key) return {status:'NEEDS_KEY', records:0};
  const month = kstDayOf(now.toISOString()).slice(0,7);
  const next = new Date(`${month}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1);
  let records = 0;
  for (const selected of [month,next.toISOString().slice(0,7)]) {
    const cached = await db.prepare('SELECT retrieved_at FROM holiday_months WHERE month=?').bind(selected).first<{retrieved_at:string}>();
    if (cached && Date.parse(cached.retrieved_at) > now.getTime()-86400000) continue;
    const url = buildDataGoKrUrl('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo',key,
      {solYear:selected.slice(0,4),solMonth:selected.slice(5,7),numOfRows:'100',pageNo:'1',_type:'json'});
    const payload = await fetchOfficialJson(url,{timeoutMs:8000,retries:1});
    const rows = normalizeHolidays(payload,selected);
    await db.prepare(`INSERT INTO holiday_months(month,payload,retrieved_at,source_hash) VALUES(?,?,?,?)
      ON CONFLICT(month) DO UPDATE SET payload=excluded.payload,retrieved_at=excluded.retrieved_at,source_hash=excluded.source_hash`)
      .bind(selected,JSON.stringify(rows),now.toISOString(),await sha256(rows)).run();
    records += rows.length;
  }
  return {status:'SUCCESS', records};
}
