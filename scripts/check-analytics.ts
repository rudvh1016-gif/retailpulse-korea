/**
 * Read-only public response inspection, not proof of analytics collection
 *
 * Initial HTML can omit a tag loaded after hydration and explicit consent
 * A tag reference can also exist while blocked, disabled or configured for
 * another stream Neither presence nor absence establishes account receipt
 * This script does not execute page scripts, send events or access accounts
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

  // 1. References in this initial HTML response only
  console.log("INITIAL HTML ANALYTICS REFERENCES");
  let anyBeacon = false;
  for (const beacon of ANALYTICS_BEACONS) {
    const hits = html.match(new RegExp(beacon.pattern, "gi"))?.length ?? 0;
    if (hits > 0) anyBeacon = true;
    console.log(`  ${beacon.name}: ${hits === 0 ? "absent" : `${hits} reference(s)`}`);
  }
  console.log(`  INITIAL_HTML: ${anyBeacon ? "REFERENCES_PRESENT" : "NO_REFERENCES_FOUND"}`);
  console.log("  HYDRATED_OR_CONSENT_GATED_COLLECTION: UNKNOWN (scripts were not executed)");
  console.log("  GA4_ACCOUNT_RECEIPT: UNKNOWN (no account access)");
  console.log("  References alone do not prove collection or its absence and do not justify installing another tracker\n");

  // 2. Header evidence only, not a browser execution or complete CSP evaluation
  console.log("CONTENT-SECURITY-POLICY (live header, not the source file)");
  const csp = response.headers.get("content-security-policy");
  if (!csp) {
    console.log("  No CSP response header observed Browser policy and collection remain UNKNOWN");
  } else {
    const scriptSrc = directiveOf(csp, "script-src") ?? "(no script-src; default-src applies)";
    const connectSrc = directiveOf(csp, "connect-src") ?? "(no connect-src; default-src applies)";
    console.log(`  script-src : ${scriptSrc}`);
    console.log(`  connect-src: ${connectSrc}`);
    const references = CLOUDFLARE_ANALYTICS_HOSTS.filter((host) => csp.includes(host));
    console.log(`  Cloudflare host text references: ${references.length}/${CLOUDFLARE_ANALYTICS_HOSTS.length}`);
    console.log("  Text references do not establish effective script/connect permission or successful collection");
  }
  console.log("");

  // 3. Which search tools have a verification tag being served?
  console.log("SEARCH TOOL VERIFICATION (served meta tags only)");
  const google = metaContent(html, "google-site-verification");
  const naver = metaContent(html, "naver-site-verification");
  console.log(`  google-site-verification: ${redact(google)}`);
  console.log(`  naver-site-verification : ${redact(naver)}`);
  console.log("  NOTE: an absent tag means no verification tag was observed in this response Google also");
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
