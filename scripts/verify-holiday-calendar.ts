/**
 * Reads the official holiday publications for Japan and mainland China and
 * checks lib/holiday-calendar.ts against them.
 *
 *   Japan: the Cabinet Office CSV of national holidays, which already lists
 *          substitute holidays (振替休日) and sandwiched holidays (休日).
 *   China: the State Council General Office notice on the year's holiday
 *          arrangement, as published on www.gov.cn. Adjusted working days
 *          (调休上班) are recorded as working days, never as holidays.
 *
 * It needs no secret and touches no database. It runs only when the calendar
 * or this script changes in a pull request, or by hand — there is no
 * schedule. Output is JSON lines; the exit code is non-zero only when the
 * calendar disagrees with a publication it could read.
 */
import { createHash } from "node:crypto";
import { HOLIDAY_SOURCES, OFFICIAL_DAYS } from "../lib/holiday-calendar";

const JP_CSV = HOLIDAY_SOURCES.JP.url;
const YEARS = [2026, 2027];
const problems: string[] = [];

function log(value: Record<string, unknown>) {
  console.log(JSON.stringify(value));
}

async function fetchBytes(url: string): Promise<{ status: number; type: string; bytes: Uint8Array } | { error: string }> {
  try {
    const response = await fetch(url, { headers: { "user-agent": "KORETAIL holiday calendar check (+https://koretaildata.com)" }, signal: AbortSignal.timeout(20_000) });
    return { status: response.status, type: response.headers.get("content-type") ?? "", bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 120) : "fetch_failed" };
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&[a-z]+;/g, " ").replace(/[ \t　]+/g, " ").replace(/\n\s*/g, "\n").trim();

// Japan -------------------------------------------------------------------
const jp = await fetchBytes(JP_CSV);
const japan: Array<{ date: string; name: string }> = [];
if ("error" in jp) log({ source: "JP_CAO_CSV", url: JP_CSV, error: jp.error });
else {
  const decoded = new TextDecoder("shift_jis").decode(jp.bytes);
  for (const line of decoded.split(/\r?\n/)) {
    const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2}),(.+)$/.exec(line.trim());
    if (!match || !YEARS.includes(Number(match[1]))) continue;
    japan.push({ date: `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`, name: match[4].trim() });
  }
  log({ source: "JP_CAO_CSV", url: JP_CSV, status: jp.status, sha256: sha256(jp.bytes), rows: japan.length, years: YEARS, holidays: japan });
  // The calendar must list exactly the published rows for the years it covers.
  const published = new Set(japan.filter((row) => HOLIDAY_SOURCES.JP.years.includes(Number(row.date.slice(0, 4)))).map((row) => `${row.date} ${row.name}`));
  const listed = new Set(OFFICIAL_DAYS.filter((day) => day.country === "JP").map((day) => `${day.start} ${day.name}`));
  for (const row of published) if (!listed.has(row)) problems.push(`JP missing ${row}`);
  for (const row of listed) if (!published.has(row)) problems.push(`JP not published ${row}`);
  // 休日 is either a substitute holiday (after a holiday that fell on Sunday)
  // or a citizens' holiday (between two holidays); the kind must say which.
  const holidayDates = new Set(japan.map((row) => row.date));
  const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  for (const day of OFFICIAL_DAYS.filter((entry) => entry.country === "JP" && entry.name === "休日")) {
    let back = shift(day.start, -1), sundayBefore = false;
    while (holidayDates.has(back)) { if (new Date(`${back}T00:00:00Z`).getUTCDay() === 0) sundayBefore = true; back = shift(back, -1); }
    const sandwiched = holidayDates.has(shift(day.start, -1)) && holidayDates.has(shift(day.start, 1));
    const expected = sundayBefore ? "SUBSTITUTE" : sandwiched ? "CITIZENS_HOLIDAY" : "UNKNOWN";
    if (day.kind !== expected) problems.push(`JP ${day.start} kind ${day.kind} but rule says ${expected}`);
  }
}

// China -------------------------------------------------------------------
// The notice URL is not predictable, so the government site's own search is
// asked for it; every candidate is printed so a person can check the pick.
// The recorded notice is always re-read, whether or not the search finds it.
const candidates = new Map<string, string>([[HOLIDAY_SOURCES.CN.url, String(HOLIDAY_SOURCES.CN.years[0])]]);
for (const year of YEARS) {
  const query = encodeURIComponent(`${year}年部分节假日安排`);
  for (const url of [
    `https://sousuo.www.gov.cn/search-gov/data?t=zhengcelibrary_gw&q=${query}&timetype=timeqb&searchfield=title&sort=pubtime&sortType=1&p=1&n=10`,
    `https://sousuo.www.gov.cn/search-gov/data?t=zhengcelibrary&q=${query}&searchfield=title&sort=pubtime&p=1&n=10`,
  ]) {
    const result = await fetchBytes(url);
    if ("error" in result) { log({ source: "CN_GOV_SEARCH", year, url, error: result.error }); continue; }
    const body = new TextDecoder("utf-8").decode(result.bytes);
    const found = [...body.matchAll(/https?:\\?\/\\?\/www\.gov\.cn\\?\/[^"'\s<>]*content_\d+\.htm/g)].map((m) => m[0].replace(/\\\//g, "/"));
    const titles = [...body.matchAll(/"title"\s*:\s*"([^"]{0,120})"/g)].map((m) => m[1]).slice(0, 10);
    log({ source: "CN_GOV_SEARCH", year, url, status: result.status, type: result.type, found: [...new Set(found)].slice(0, 10), titles, head: body.slice(0, 600) });
    for (const link of found) if (!candidates.has(link)) candidates.set(link, String(year));
  }
}
for (const [url, year] of candidates) {
  const page = await fetchBytes(url);
  if ("error" in page) { log({ source: "CN_GOV_NOTICE", url, error: page.error }); continue; }
  const body = text(new TextDecoder("utf-8").decode(page.bytes));
  const title = /国务院办公厅关于\d{4}年部分节假日安排的通知/.exec(body)?.[0] ?? null;
  if (!title) { log({ source: "CN_GOV_NOTICE", url, year, status: page.status, title: null }); continue; }
  const lines = body.split("\n").filter((line) => /放假|上班|国办发明电|发文字号|成文日期|发布日期|\d{4}年\d{1,2}月\d{1,2}日/.test(line)).slice(0, 40);
  log({ source: "CN_GOV_NOTICE", url, year, status: page.status, sha256: sha256(page.bytes), title, lines });
  if (url !== HOLIDAY_SOURCES.CN.url) {
    if (!HOLIDAY_SOURCES.CN.years.includes(Number(year))) log({ source: "CN_GOV_NOTICE", renewalAvailable: true, year, url });
    continue;
  }
  // Every item the calendar lists must be quoted verbatim from this notice,
  // and every holiday line of the notice must be in the calendar.
  const flat = body.replace(/\s+/g, "");
  if (title !== HOLIDAY_SOURCES.CN.title) problems.push(`CN title ${title}`);
  if (!flat.includes(HOLIDAY_SOURCES.CN.documentNumber ?? "")) problems.push("CN document number not found");
  for (const day of OFFICIAL_DAYS.filter((entry) => entry.country === "CN")) {
    if (!day.quote || !flat.includes(day.quote.replace(/\s+/g, ""))) problems.push(`CN quote not found for ${day.name} ${day.start}`);
  }
  const holidayLines = body.split("\n").filter((line) => /^[一二三四五六七八九十]+、/.test(line.trim()) && /放假/.test(line));
  const listedNames = new Set(OFFICIAL_DAYS.filter((day) => day.country === "CN" && day.kind === "HOLIDAY").map((day) => day.name));
  if (holidayLines.length !== listedNames.size) problems.push(`CN notice has ${holidayLines.length} holiday lines, calendar lists ${listedNames.size}`);
}
if ("error" in jp) log({ source: "JP_CAO_CSV", warning: "the CSV could not be read; the calendar was not checked against it" });

log({ result: problems.length ? "MISMATCH" : "MATCH", problems });
if (problems.length) process.exitCode = 1;
