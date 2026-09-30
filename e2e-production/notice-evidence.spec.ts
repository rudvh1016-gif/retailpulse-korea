import { test } from "@playwright/test";
import { normalizeNotice, parseNoticeFeed, parseUrgentBanner, statusOf } from "../lib/official-notices";

/**
 * Evidence run, manual dispatch only: the notice extractor's parsing on the
 * airport's live notice feed and urgent-notice banner. Prints normalised
 * records (title, posting date, effective period, status, link); stores nothing.
 */
const FEED_URL = "https://www.airport.kr/bbs/ap_ko/175/rssList.do?row=50";
const BANNER_URL = "https://www.airport.kr/imageSlide/ap_ko/91/getJsonImageSlideArtclList.do";

test("airport notices, normalised", async ({ request }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  const checkedAt = new Date().toISOString();
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const feed = await request.get(FEED_URL).then((response) => response.text()).catch(() => "");
  const banner = await request.get(BANNER_URL).then((response) => response.text()).catch(() => "[]");
  const raw = [...parseNoticeFeed(feed, FEED_URL), ...parseUrgentBanner(banner, "https://www.airport.kr/ap_ko/index.do")];
  console.log(`NOTICES feed ${feed.length}B banner ${banner.length}B items ${raw.length}`);
  for (const notice of raw) {
    const record = await normalizeNotice(notice, checkedAt);
    console.log(`NOTICE ${JSON.stringify({ source: record.source, id: record.sourceId, title: record.title, postedAt: record.postedAt, period: record.period, status: statusOf(record, today), topics: record.topics, url: record.url })}`);
  }
});
