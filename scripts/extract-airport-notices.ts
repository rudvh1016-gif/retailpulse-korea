/**
 * Manual, read-only extractor for the two airport notice sources
 * (lib/official-notices.ts). Not scheduled; nothing is written to the
 * database. It prints normalised records and, given the previous review
 * file, what changed (new / revised / no longer listed), so a person can
 * update config/official-notices.review.json.
 *
 *   npx tsx scripts/extract-airport-notices.ts [--previous config/official-notices.review.json]
 *
 * The sandbox that built this cannot reach airport.kr; the same parsing runs
 * in the manual evidence spec (e2e-production/notice-evidence.spec.ts) on a
 * GitHub runner.
 */
import { readFileSync } from "node:fs";
import { compareNotices, normalizeNotice, parseNoticeFeed, parseUrgentBanner, statusOf, type NoticeRecord } from "../lib/official-notices";

export const FEED_URL = "https://www.airport.kr/bbs/ap_ko/175/rssList.do?row=50";
export const BANNER_URL = "https://www.airport.kr/imageSlide/ap_ko/91/getJsonImageSlideArtclList.do";
export const BANNER_PAGE = "https://www.airport.kr/ap_ko/index.do";

async function main() {
  const checkedAt = new Date().toISOString();
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const [feed, banner] = await Promise.all([FEED_URL, BANNER_URL].map((url) => fetch(url, { signal: AbortSignal.timeout(20_000) }).then((response) => response.text())));
  const raw = [...parseNoticeFeed(feed, FEED_URL), ...parseUrgentBanner(banner, BANNER_PAGE)];
  const records = await Promise.all(raw.map((notice) => normalizeNotice(notice, checkedAt)));
  for (const record of records) console.log(JSON.stringify({ ...record, status: statusOf(record, today) }));
  const previousIndex = process.argv.indexOf("--previous");
  if (previousIndex > 0) {
    const previous = (JSON.parse(readFileSync(process.argv[previousIndex + 1], "utf8")).notices ?? []) as NoticeRecord[];
    for (const change of compareNotices(previous, records)) console.log(JSON.stringify({ change }));
  }
}

if (process.argv[1]?.endsWith("extract-airport-notices.ts")) void main();
