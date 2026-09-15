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
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "X-Frame-Options", value: "DENY" },
        ...(isStagingDeployment ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] : []),
      ],
    }];
  },
};

export default nextConfig;
