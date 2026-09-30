/**
 * Official airport notices, normalised for review (not yet shown publicly).
 *
 * Two first-party sources on the airport's own site, read by a manual run
 * (scripts/extract-airport-notices.ts), never by a schedule:
 *
 *   AIRPORT_NOTICE_BOARD  the notice board's RSS feed (공지사항)
 *   AIRPORT_URGENT_BANNER the urgent-notice banner data on every page (긴급)
 *
 * A notice keeps its posting date and its effective period apart: the period
 * is read only from the notice's own words ("9월28일(월) ~ 10월2일(금)",
 * "(26. 4. 20.~)", "3월 1일부터"), never from the posting date. A notice whose
 * words give no period stays UNKNOWN_PERIOD. Text inside a notice is data;
 * nothing in it is followed as an instruction.
 *
 * Publication is held (see config/official-notices.review.json): the site's
 * copyright policy asks for prior agreement for reuse that earns revenue, so
 * only titles, dates, links and our own short fact lines are kept for review.
 */

export type NoticeSource = "AIRPORT_NOTICE_BOARD" | "AIRPORT_URGENT_BANNER";
export type NoticeStatus = "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED" | "UNKNOWN_PERIOD";

export interface RawNotice {
  source: NoticeSource;
  /** The source's own id (article number), or a stable key when it has none. */
  sourceId: string;
  title: string;
  body: string;
  /** As the source states it; null when it states none (the banner does not). */
  postedAt: string | null;
  url: string;
}

export interface Period {
  from: string | null;
  to: string | null;
  /** The day service resumes, when the notice says so ("운행재개 : 10월 3일"). */
  resumesOn: string | null;
  /** Which words the period came from. */
  basis: "TITLE" | "BODY" | "NONE";
  quote: string | null;
}

export interface NoticeRecord {
  source: NoticeSource;
  sourceId: string;
  title: string;
  postedAt: string | null;
  period: Period;
  topics: string[];
  terminals: Array<"T1" | "T2">;
  url: string;
  /** A hash of title + body: a changed hash for the same sourceId is a revision. */
  contentHash: string;
  checkedAt: string;
}

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null;
};

/** A month/day without a year belongs to the year the notice was written in, or the next one when that would put it far before. */
function withYear(month: number, day: number, reference: string): string | null {
  const year = Number(reference.slice(0, 4));
  const candidate = iso(year, month, day);
  if (!candidate) return null;
  // "1월 3일" in a notice written in late December is the next January.
  return candidate < reference.slice(0, 10) && Number(reference.slice(5, 7)) - month >= 6 ? iso(year + 1, month, day) : candidate;
}

/**
 * The effective period stated in a notice's own words. The reference date
 * (posting date, else the date it was checked) only supplies a missing year.
 */
export function parsePeriod(title: string, body: string, reference: string): Period {
  for (const [text, basis] of [[title, "TITLE"], [body, "BODY"]] as const) {
    // "9월28일(월) ~ 10월2일(금)"
    const range = /(\d{1,2})월\s*(\d{1,2})일(?:\s*\([^)]*\))?\s*[~∼-]\s*(?:(\d{1,2})월\s*)?(\d{1,2})일/.exec(text);
    if (range) {
      const from = withYear(Number(range[1]), Number(range[2]), reference);
      const to = from ? withYear(Number(range[3] ?? range[1]), Number(range[4]), from) : null;
      const resume = /재개\s*[:：]?\s*(\d{1,2})월\s*(\d{1,2})일/.exec(text);
      return { from, to, resumesOn: resume && from ? withYear(Number(resume[1]), Number(resume[2]), from) : null, basis, quote: range[0] };
    }
    // "(26. 4. 20.~)" or "(2025.6.10.~)"
    const open = /\(\s*(\d{2}|\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*~\s*\)/.exec(text);
    if (open) {
      const year = open[1].length === 2 ? 2000 + Number(open[1]) : Number(open[1]);
      return { from: iso(year, Number(open[2]), Number(open[3])), to: null, resumesOn: null, basis, quote: open[0] };
    }
    // "2025년 6월 10일부터" / "3월 1일부터"
    const since = /(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일부터/.exec(text);
    if (since) {
      const from = since[1] ? iso(Number(since[1]), Number(since[2]), Number(since[3])) : withYear(Number(since[2]), Number(since[3]), reference);
      return { from, to: null, resumesOn: null, basis, quote: since[0] };
    }
  }
  return { from: null, to: null, resumesOn: null, basis: "NONE", quote: null };
}

const TOPICS: Array<[string, RegExp]> = [
  ["TRANSPORT", /자기부상|열차|버스|셔틀|주차|교통/],
  ["SECURITY", /보안검색|보조배터리|전자담배|기내반입|액체/],
  ["DEPARTURE", /출국|우선출국|체크인|탑승/],
  ["FACILITY", /공사|폐쇄|운영\s*중단|휴점|이전/],
];

export function statusOf(record: Pick<NoticeRecord, "title" | "period">, today: string): NoticeStatus {
  if (/취소|철회/.test(record.title)) return "CANCELLED";
  const { from, to } = record.period;
  if (!from && !to) return "UNKNOWN_PERIOD";
  if (to && to < today) return "ENDED";
  if (from && from > today) return "UPCOMING";
  return "ACTIVE";
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeNotice(raw: RawNotice, checkedAt: string): Promise<NoticeRecord> {
  const title = raw.title.replace(/\}+\s*$/, "").replace(/\s+/g, " ").trim();
  const body = raw.body.replace(/\s+/g, " ").trim();
  const text = `${title} ${body}`;
  return {
    source: raw.source,
    sourceId: raw.sourceId,
    title,
    postedAt: raw.postedAt,
    period: parsePeriod(title, body, raw.postedAt ?? checkedAt),
    topics: TOPICS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic),
    terminals: (["T1", "T2"] as const).filter((terminal) => new RegExp(`${terminal}|제${terminal.slice(1)}\\s*(?:여객)?터미널`).test(text)),
    url: raw.url,
    contentHash: await sha256Hex(`${title}\n${body}`),
    checkedAt,
  };
}

export type NoticeChange = "NEW" | "REVISED" | "UNCHANGED" | "NO_LONGER_LISTED";

/**
 * What changed between two reviewed lists. A notice that disappears from the
 * source is "no longer listed" — not "ended": only its own words end it.
 */
export function compareNotices(previous: readonly NoticeRecord[], current: readonly NoticeRecord[]): Array<{ key: string; change: NoticeChange }> {
  const key = (record: NoticeRecord) => `${record.source}:${record.sourceId}`;
  const before = new Map(previous.map((record) => [key(record), record]));
  const now = new Map(current.map((record) => [key(record), record]));
  const out: Array<{ key: string; change: NoticeChange }> = [];
  for (const [id, record] of now) {
    const old = before.get(id);
    out.push({ key: id, change: !old ? "NEW" : old.contentHash !== record.contentHash ? "REVISED" : "UNCHANGED" });
  }
  for (const id of before.keys()) if (!now.has(id)) out.push({ key: id, change: "NO_LONGER_LISTED" });
  return out;
}

/** RSS 2.0 items of the notice board (title, pubDate, description, link). */
export function parseNoticeFeed(xml: string, feedUrl: string): RawNotice[] {
  const cdata = (value: string | undefined) => (value ?? "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match, index) => {
    const item = match[1];
    const pick = (tag: string) => cdata(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(item)?.[1]);
    const link = pick("link");
    const id = /\/(\d+)\/artclView\.do/.exec(link)?.[1] ?? `${pick("pubDate")}#${index}`;
    const posted = pick("pubDate");
    return {
      source: "AIRPORT_NOTICE_BOARD" as const,
      sourceId: id,
      title: pick("title"),
      body: pick("description").replace(/<[^>]+>/g, " "),
      postedAt: /^\d{4}-\d{2}-\d{2}/.test(posted) ? posted.slice(0, 10) : null,
      url: link || feedUrl,
    };
  });
}

/** The urgent-notice banner data: [{ artclSeq, sj, cn }] (content may hold HTML). */
export function parseUrgentBanner(json: string, pageUrl: string): RawNotice[] {
  const rows = JSON.parse(json) as Array<{ artclSeq?: unknown; sj?: unknown; cn?: unknown }>;
  return rows.filter((row) => row && typeof row.sj === "string").map((row) => ({
    source: "AIRPORT_URGENT_BANNER" as const,
    sourceId: String(row.artclSeq ?? row.sj),
    title: String(row.sj),
    body: String(row.cn ?? "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "),
    postedAt: null,
    url: pageUrl,
  }));
}
