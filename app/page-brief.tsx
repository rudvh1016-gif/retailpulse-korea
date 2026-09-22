/**
 * The part of every page that exists before JavaScript does.
 *
 * A server component — deliberately no `"use client"`. Everything it renders
 * comes from `lib/page-brief.ts` and `lib/source-catalog.ts`, both of which
 * are constant text with no React import, no fetch and no D1 read. So this
 * costs one synchronous pass over a fixed object tree at render time and adds
 * nothing to the client bundle: the strings are already in the Worker, and no
 * hydration ships for them.
 *
 * That property is the whole point. `docs/ZERO_COST_HYBRID_AUDIT.md` gives a
 * Cloudflare Free HTTP invocation 10 ms of CPU, so the fix for an empty page
 * could not be "fetch the summary on the server" — that is a D1 read on every
 * crawl of every page, and `tests/edge-cache.test.mjs` records roughly 2,795
 * rows read per uncached `/api/live/summary` against a 5,000,000 rows/day
 * ceiling. The live numbers stay where they are, on the client, behind their
 * own freshness labels. What moves to the server is the half that is true all
 * day: what the screen answers, which institution each number comes from, and
 * what it does not mean.
 *
 * Visible, not hidden
 * ───────────────────
 * This renders as ordinary visible content at the end of `<main>`, in the
 * page's own language. Text served to a crawler and withheld from a reader is
 * cloaking, and the penalty for it is worse than the problem it would solve.
 * It is also genuinely the copy a first-time reader needs — the site is full
 * of numbers whose caveats used to live only in a collapsed panel on `/more`.
 *
 * The styling in app/globals.css stays inside the 2026-09-13 owner UI lock:
 * white ground, the existing type scale, one hairline rule above the block,
 * no new blue, no pills, no card.
 */
import { seoLocales, type SeoLocale, type SeoSlug } from "./seo-config";
import { activeSourceCatalog, sourceName, sourceProvenance, sourceUse } from "../lib/source-catalog";
import { BRIEF_LABELS, localize, pageBrief, type BriefArea } from "../lib/page-brief";

export default function PageBrief({ locale, slug, area = "myeongdong" }: { locale: SeoLocale; slug?: SeoSlug; area?: BriefArea }) {
  const brief = pageBrief(slug, area);
  const say = (words: Parameters<typeof localize>[1]) => localize(locale, words);
  const sources = brief.sources
    .map((id) => activeSourceCatalog.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <section className="page-brief" aria-labelledby="page-brief-title">
      <h2 id="page-brief-title">{say(brief.heading)}</h2>
      <p className="page-brief-intro">{say(brief.intro)}</p>

      <h3>{say(BRIEF_LABELS.answers)}</h3>
      <ul className="page-brief-list">
        {brief.answers.map((answer, index) => <li key={index}>{say(answer)}</li>)}
      </ul>

      <h3>{say(BRIEF_LABELS.sources)}</h3>
      <ul className="page-brief-sources">
        {sources.map((row) => {
          const provenance = sourceProvenance[row.id];
          return (
            <li key={row.id}>
              <strong>{sourceName(row.id, locale)}</strong>
              <span>{sourceUse(row, locale)}</span>
              {/*
                The citation, as a link a reader can follow and a crawler can
                resolve. `rel="noopener"` only — deliberately NOT "nofollow":
                linking out to the primary source is the point, and these are
                Korean government portals.
              */}
              {provenance && (
                <span className="page-brief-citation">
                  {provenance.url
                    ? <a href={provenance.url} rel="noopener" target="_blank">{provenance.identifier}</a>
                    : provenance.identifier}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        Question-form headings, answered in the first sentence. These are the
        questions readers actually arrive with, and they are the same array
        `pageStructuredData` serializes into FAQPage JSON-LD — one object, so
        the markup can never claim a Q&A the page does not show.
      */}
      <h3 className="page-brief-questions-title">{say(BRIEF_LABELS.questions)}</h3>
      {brief.faq.map((entry, index) => (
        <div className="page-brief-question" key={index}>
          <h3>{say(entry.question)}</h3>
          <p>{say(entry.answer)}</p>
        </div>
      ))}

      {/*
        The other three locale copies of THIS page, as real links.
        `buildMetadata` already declares them as hreflang in the head, but a
        crawler that only follows anchors — and a reader who landed on the
        wrong language — get nothing from a <link>. Four pages, one hop apart.
      */}
      <LocaleLinks locale={locale} slug={slug} area={area} />
    </section>
  );
}

const LOCALE_NAME: Record<SeoLocale, string> = { ko: "한국어", en: "English", zh: "简体中文", ja: "日本語" };
const OTHER_LANGUAGES = ["다른 언어로 보기", "Read this page in", "以其他语言查看", "他の言語で見る"] as const;

function LocaleLinks({ locale, slug, area }: { locale: SeoLocale; slug?: SeoSlug; area: BriefArea }) {
  const others = seoLocales.filter((other) => other !== locale);
  const href = (other: SeoLocale) =>
    !slug ? `/${other}`
      : slug === "tourism-desk" ? `/${other}/tourism-desk/${area}`
        : `/${other}/${slug}`;
  return (
    <nav className="page-brief-locales" aria-label={OTHER_LANGUAGES[seoLocales.indexOf(locale)]}>
      <span>{OTHER_LANGUAGES[seoLocales.indexOf(locale)]}</span>
      {others.map((other) => (
        <a key={other} href={href(other)} hrefLang={other === "zh" ? "zh-CN" : other === "ko" ? "ko-KR" : other === "ja" ? "ja-JP" : "en"}>
          {LOCALE_NAME[other]}
        </a>
      ))}
    </nav>
  );
}
