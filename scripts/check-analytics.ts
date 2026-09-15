/**
 * Is KORETAIL ready to count its visitors, and is anything already counting?
 *
 * Read-only and credential-free: GET requests to public URLs only. It answers
 * the three questions that decide the work, none of which can be answered
 * from a checkout:
 *
 *   1. Is a visitor-measurement beacon ALREADY on the page? Installing a
 *      second one would double every page view and make the first number the
 *      owner ever sees a wrong one.
 *   2. Does the live response actually carry the Content-Security-Policy that
 *      `next.config.ts` declares? The string is compiled into the Worker, but
 *      compiled-in is not the same as applied, and only the live header
 *      settles it. If it IS applied, its `script-src` allows exactly
 *      googletagmanager — so Cloudflare Web Analytics, enabled from the
 *      dashboard, would be silently blocked by the browser and the owner
 *      would see an empty dashboard with no error to point at.
 *   3. Are the Google and Naver verification meta tags being served? Each is
 *      driven by a GitHub Actions Variable that a checkout cannot read, so the
 *      served HTML is the only evidence available here that someone has
 *      already registered the site with that search tool.
 *
 * What it deliberately does NOT do: conclude anything about an account it
 * cannot see. An absent meta tag means the meta METHOD is not in use — Google
 * also verifies by DNS, and a site can rank without Search Console at all.
 * That distinction is the whole point of this probe, so it reports what it
 * observed and marks the rest UNKNOWN.
 */

const TIMEOUT_MS = 20_000;

const ANALYTICS_BEACONS = [
  { name: "Cloudflare Web Analytics", pattern: /static\.cloudflareinsights\.com|beacon\.min\.js|data-cf-beacon/i },
  { name: "Google Analytics / gtag", pattern: /googletagmanager\.com\/gtag|gtag\/js/i },
  { name: "Plausible", pattern: /plausible\.io/i },
  { name: "Umami", pattern: /umami/i },
] as const;

/** Hosts Cloudflare Web Analytics needs before a browser will run its beacon. */
const CLOUDFLARE_ANALYTICS_HOSTS = ["static.cloudflareinsights.com", "cloudflareinsights.com"];

function metaContent(html: string, name: string): string | null {
  const pattern = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, "i");
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, "i");
  return html.match(pattern)?.[1] ?? html.match(reversed)?.[1] ?? null;
}

/** Never print a token in full: presence and length are the finding. */
function redact(value: string | null): string {
  if (!value) return "ABSENT";
  return `PRESENT (${value.length} chars, starts "${value.slice(0, 4)}…")`;
}

function directiveOf(csp: string, name: string): string | null {
  for (const directive of csp.split(";")) {
    const trimmed = directive.trim();
    if (trimmed.toLowerCase().startsWith(`${name} `)) return trimmed;
  }
  return null;
}

async function main(): Promise<void> {
  const origin = new URL((process.argv.find((v) => v.startsWith("--origin="))?.slice(9) ?? process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "").trim()).origin;
  console.log(`KORETAIL analytics readiness — ${origin}\n`);

  const response = await fetch(`${origin}/ko`, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const html = await response.text();
  console.log(`GET /ko -> ${response.status}, ${html.length} bytes\n`);

  // 1. Anything already counting?
  console.log("EXISTING MEASUREMENT");
  let anyBeacon = false;
  for (const beacon of ANALYTICS_BEACONS) {
    const hits = html.match(new RegExp(beacon.pattern, "gi"))?.length ?? 0;
    if (hits > 0) anyBeacon = true;
    console.log(`  ${beacon.name}: ${hits === 0 ? "absent" : `${hits} reference(s)`}`);
  }
  console.log(`  VERDICT: ${anyBeacon ? "something is already measuring — do not install a second" : "nothing is measuring visitors"}\n`);

  // 2. Would a Cloudflare beacon be allowed to run?
  console.log("CONTENT-SECURITY-POLICY (live header, not the source file)");
  const csp = response.headers.get("content-security-policy");
  if (!csp) {
    console.log("  not served — no CSP can block a beacon, so enabling Web Analytics needs no code change here");
  } else {
    const scriptSrc = directiveOf(csp, "script-src") ?? "(no script-src; default-src applies)";
    const connectSrc = directiveOf(csp, "connect-src") ?? "(no connect-src; default-src applies)";
    console.log(`  script-src : ${scriptSrc}`);
    console.log(`  connect-src: ${connectSrc}`);
    const allowed = CLOUDFLARE_ANALYTICS_HOSTS.some((host) => csp.includes(host));
    console.log(`  Cloudflare Web Analytics host allowed: ${allowed ? "YES" : "NO"}`);
    if (!allowed) {
      console.log("  => Enabling Web Analytics in the Cloudflare dashboard alone would NOT work:");
      console.log("     the browser would refuse the beacon and the dashboard would stay empty,");
      console.log("     with nothing on the page to explain why.");
    }
  }
  console.log("");

  // 3. Which search tools have a verification tag being served?
  console.log("SEARCH TOOL VERIFICATION (served meta tags only)");
  const google = metaContent(html, "google-site-verification");
  const naver = metaContent(html, "naver-site-verification");
  console.log(`  google-site-verification: ${redact(google)}`);
  console.log(`  naver-site-verification : ${redact(naver)}`);
  console.log("  NOTE: an absent tag means the META METHOD is not in use. Google also");
  console.log("  verifies by DNS TXT, so absence here is NOT proof the site is unregistered,");
  console.log("  and presence is NOT proof a sitemap was ever submitted. Account state is UNKNOWN");
  console.log("  from outside and only the owner can confirm it.\n");

  // Whether robots/sitemap are being served at all is already proven every
  // deploy by the discoverability check; repeated here only as one line of
  // context for a search-tool submission decision.
  const robots = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const sitemap = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const sitemapBody = await sitemap.text();
  console.log("SUBMISSION TARGETS");
  console.log(`  robots.txt : ${robots.status}`);
  console.log(`  sitemap.xml: ${sitemap.status}, ${(sitemapBody.match(/<loc>/g) ?? []).length} URLs`);
}

await main();

export {};
