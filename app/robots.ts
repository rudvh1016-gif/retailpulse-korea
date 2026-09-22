import type { MetadataRoute } from "next";
import { isStagingDeployment, siteOrigin } from "./seo-config";

/**
 * The crawlers KORETAIL names on purpose.
 *
 * `User-agent: *` with `Allow: /` already permits every one of these, so
 * naming them changes no crawler's behaviour today. It is here for two other
 * reasons: the policy becomes auditable — a reader of this file can see
 * exactly which agents were considered rather than inferring it from a
 * wildcard — and a future decision to restrict one has a place to live that
 * is a one-line change rather than a redesign.
 *
 * Why every one of them is ALLOWED, including the training crawlers
 * ─────────────────────────────────────────────────────────────────
 * The 2026 publisher default runs the other way: block the training bots
 * (GPTBot, ClaudeBot, Google-Extended, CCBot), allow only the answering ones,
 * because measured crawl-to-refer ratios are brutal — Anthropic around
 * 2,200:1, OpenAI around 217:1. That is an advertising argument. It protects
 * pageviews an in-chat answer would otherwise have earned.
 *
 * KORETAIL sells no pageviews. It has no ads, no paywall and no account. Its
 * actual problem is that nobody knows the brand exists, and training
 * inclusion is the only route by which an assistant names this site without
 * being handed a link first. The cost side is bounded rather than assumed:
 * forty indexable URLs, static assets served outside the Worker, no paid
 * egress, and every group below repeats `Disallow: /api/` so no crawler
 * reaches a D1-backed endpoint.
 *
 * Bytespider is allowed too, against the common recommendation, because this
 * site publishes Simplified Chinese pages for Chinese-speaking visitors to
 * Korea and ByteDance's assistant is a discovery surface for exactly those
 * readers. Blocking it would forfeit the audience the `/zh` locale exists for.
 *
 * Google-Extended stays allowed: disallowing it withholds Gemini training
 * only and has no effect on Google Search indexing or AI Overviews
 * eligibility, both of which run on Googlebot. It would cost a surface and
 * protect nothing.
 */
const NAMED_CRAWLERS = [
  // OpenAI: training, the ChatGPT search index, and live user-initiated fetch.
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  // Anthropic: training, user-triggered, and search index.
  "ClaudeBot", "Claude-User", "Claude-SearchBot",
  // Perplexity.
  "PerplexityBot", "Perplexity-User",
  // Google and Microsoft. Bing matters twice over: ChatGPT Search reads it.
  "Googlebot", "Google-Extended", "bingbot",
  // Apple, Amazon, Meta, Mistral, Common Crawl, You.com, ByteDance.
  "Applebot", "Applebot-Extended", "Amazonbot", "Meta-ExternalAgent",
  "MistralAI-User", "CCBot", "YouBot", "Bytespider",
  // Korea. Naver's Yeti is the single most important crawler for the Korean
  // half of this audience, and Daum publishes its token both ways.
  "Yeti", "Daumoa", "Daum",
] as const;

/**
 * `/api/` is closed to everyone, in every group.
 *
 * This is not stylistic repetition. Under RFC 9309 §2.2.1 a crawler that
 * finds a group naming it obeys that group and ignores `*` completely, so a
 * named group written without this rule would be a standing invitation to
 * the D1-backed endpoints for precisely the agents listed above. Building
 * every group from one shared shape is what makes it impossible to forget,
 * and `lib/discoverability.ts` re-checks it against the live file.
 */
const allowSiteButNotApi = (userAgent: string) => ({ userAgent, allow: "/", disallow: ["/api/"] });

export default function robots(): MetadataRoute.Robots {
  if (isStagingDeployment) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: [
      // `*` first, so the default is legible at the top of the file.
      allowSiteButNotApi("*"),
      ...NAMED_CRAWLERS.map(allowSiteButNotApi),
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
    host: siteOrigin,
  };
}
