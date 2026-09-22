/**
 * Writes `/llms.txt` into the built asset directory.
 *
 * What this is worth, stated plainly
 * ──────────────────────────────────
 * `llms.txt` is the file everyone names when they ask about AI traffic, and
 * the evidence says it is close to worthless as a ranking or citation lever:
 *
 *  - Google's own AI optimization guide (2026-06-29) says you do not need
 *    llms.txt or any AI-specific text file, and that publishing one "won't
 *    harm (nor help) your visibility or rankings in Google Search, as Google
 *    Search ignores them".
 *  - No major AI search provider has documented consuming third-party
 *    llms.txt files. An OtterlyAI server-log audit put AI-bot requests for
 *    the path at 0.1% of AI-bot traffic; an SE Ranking study of the 50
 *    most-AI-cited domains found one that published the file.
 *
 * So this ships as optionality, not as a traffic plan, and no report should
 * claim otherwise. It is justified only because the cost is genuinely nil: a
 * static asset served from Cloudflare's asset store, never touching the
 * Worker, generated at build time from `app/seo-config.ts` and
 * `lib/page-brief.ts` so it cannot drift from the pages it lists. The real
 * work for AI visibility is the server-rendered body copy those same modules
 * now produce; this file only restates it in one place.
 *
 * Staging writes nothing, for the same reason `app/robots.ts` answers
 * `Disallow: /` there: a staging origin must not advertise itself.
 *
 * Run by scripts/build-verified.sh after the vinext build, because it writes
 * into dist/client, which that build creates.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(repositoryRoot, "dist", "client");

const {
  isStagingDeployment,
  seoLocales,
  seoPath,
  siteOrigin,
  standaloneSeoSlugs,
  tourismDeskAreas,
  pageTitle,
  pageDescription,
} = await import(join(repositoryRoot, "app", "seo-config.ts"));
const { activeSourceCatalog, sourceName, sourceUse } = await import(join(repositoryRoot, "lib", "source-catalog.ts"));
const { pageBrief, localize } = await import(join(repositoryRoot, "lib", "page-brief.ts"));

if (isStagingDeployment) {
  console.log("llms.txt: staging build, nothing written.");
  process.exit(0);
}

const LOCALE_HEADING = { ko: "한국어 (Korean)", en: "English", zh: "简体中文 (Simplified Chinese)", ja: "日本語 (Japanese)" };

const lines = [
  "# KORETAIL",
  "",
  "> Retail Demand Signals for Korea. KORETAIL collects records published by Korean public institutions about Incheon International Airport and the Myeongdong, Hongdae and Seongsu retail districts of Seoul, and presents them in Korean, English, Simplified Chinese and Japanese.",
  "",
  "KORETAIL makes no observations of its own, runs no surveys, and holds no store sales data. Every figure on the site is collected from a named public institution and is shown with the timestamp it was retrieved at.",
  "",
  "## How to quote this site correctly",
  "",
  "These boundaries are the reason the data is worth quoting at all. Carrying the number without the boundary misstates it:",
  "",
  "- The Incheon Airport departure-hall figure is a published forecast of departure-hall USE. It does not distinguish Korean from foreign nationals, it excludes the separately published transfer forecast, and it is not the number of people queueing at any moment.",
  "- Observed departure-hall queues are a different record from the departure-hall forecast, and the two are never added together. T1 and T2 queues come from two separate APIs and are not ranked against each other.",
  "- Seoul area population is an estimate of how many people are PRESENT at that moment, published as a range. It is not a cumulative visitor count, and it does not separate residents, workers and visitors.",
  "- Card activity in Seoul's city data is DOMESTIC card activity. It is not spending by foreign visitors and it is not total sales.",
  "- Trade-area sales are quarterly public ESTIMATES for a district. They are not any individual store's revenue.",
  "- Flight records carry no passenger nationality. A route or an airline is not a nationality.",
  "- Movement attributed to a shopping purpose is a proxy for demand. It is not evidence that a purchase occurred, and it carries no monetary amount.",
  "- A current observation, an official forecast and a confirmed past result are three different values and are never merged. A reference outlook KORETAIL computed is labelled separately from an official published figure.",
  "- Where a record is missing, the value is left blank rather than estimated or replaced with a zero.",
  "",
  "## Pages",
  "",
];

for (const locale of seoLocales) {
  lines.push(`### ${LOCALE_HEADING[locale]}`, "");
  const entries = [
    { slug: undefined, area: undefined },
    ...standaloneSeoSlugs.map((slug) => ({ slug, area: undefined })),
    ...tourismDeskAreas.map((area) => ({ slug: "tourism-desk", area })),
  ];
  for (const { slug, area } of entries) {
    const title = pageTitle(locale, slug, area ?? "myeongdong").replace(/\s*\|\s*KORETAIL$/, "");
    const description = pageDescription(locale, slug, area ?? "myeongdong");
    lines.push(`- [${title}](${siteOrigin}${seoPath(locale, slug, area ?? "myeongdong")}): ${description}`);
  }
  lines.push("");
}

lines.push("## Questions this site answers", "");
{
  // English only: the per-locale copies are one hop away in the Pages list
  // above, and repeating forty answers here would bury the boundaries.
  const seen = new Set();
  for (const slug of [undefined, ...standaloneSeoSlugs, "tourism-desk"]) {
    for (const entry of pageBrief(slug).faq) {
      const question = localize("en", entry.question);
      if (seen.has(question)) continue;
      seen.add(question);
      lines.push(`- **${question}** ${localize("en", entry.answer)}`);
    }
  }
  lines.push("");
}

lines.push("## Sources", "");
for (const row of activeSourceCatalog) {
  lines.push(`- **${sourceName(row.id, "en")}** — ${sourceUse(row, "en")}`);
}
lines.push("", `## Machine-readable`, "", `- [Sitemap](${siteOrigin}/sitemap.xml)`, `- [robots.txt](${siteOrigin}/robots.txt)`, "");

const body = lines.join("\n");
await mkdir(outputDirectory, { recursive: true });
await writeFile(join(outputDirectory, "llms.txt"), body, "utf8");
console.log(`llms.txt: ${body.length} bytes written to dist/client/llms.txt`);
