import type { NextConfig } from "next";

const isStagingDeployment = process.env.RPK_DEPLOYMENT_STAGE === "staging";

/**
 * Cloudflare Web Analytics needs two hosts, and without them it fails
 * SILENTLY.
 *
 * Measured on Production 2026-09-15: nothing counts visitors at all, and this
 * policy IS served (`script-src 'self' 'unsafe-inline' googletagmanager`), so
 * switching Web Analytics on in the Cloudflare dashboard alone would not have
 * worked. The browser would refuse the beacon, the dashboard would stay empty,
 * and there would be nothing on the page to explain why. That is the whole
 * reason this is a code change rather than a setting.
 *
 *   static.cloudflareinsights.com  serves beacon.min.js            -> script-src
 *   cloudflareinsights.com         receives /cdn-cgi/rum page views -> connect-src
 *
 * Adding the hosts does not start any measurement; it only stops the browser
 * blocking it once the owner enables it. Nothing is loaded until then, and
 * Web Analytics is cookie-free and stores no IP addresses.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' data: blob: https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "X-Frame-Options", value: "DENY" },
        ...(isStagingDeployment ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] : []),
      ],
    }, ...["/airport-period/frame.html", "/airport-period/frame", "/airport-period/frame/", "/airport-period/frame-zh.html", "/airport-period/frame-zh", "/airport-period/frame-zh/"].map(source => ({
      // This public chart document is embedded by our own Korean and Chinese analysis tabs.
      // Keep DENY on every application page and reject external framing here too.
      source,
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; upgrade-insecure-requests" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    // vinext applies the first matching value for each header, so exact document
    // policies precede the unchanged catch-all policy in the returned array.
    }))].reverse();
  },
};

export default nextConfig;
