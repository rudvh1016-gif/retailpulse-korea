import type { MetadataRoute } from "next";
import { crawlableContentApis } from "../lib/crawl-policy";
import { isStagingDeployment, siteOrigin } from "./seo-config";

export default function robots(): MetadataRoute.Robots {
  if (isStagingDeployment) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  // Every page draws its main content from /api/live/summary (the
  // /predictions pages also from /api/live/predictions) after it loads. A
  // crawler that renders the page obeys robots.txt for those requests too, so
  // `Disallow: /api/` alone left Googlebot a page whose only text was the
  // load-failure message — which Search Console reported as Soft 404. The two
  // content APIs stay out of the index through `X-Robots-Tag: noindex` on
  // their responses; every other /api/ path stays uncrawled. The longer
  // `Allow` wins over `Disallow: /api/` by longest-match precedence.
  return {
    rules: { userAgent: "*", allow: ["/", ...crawlableContentApis], disallow: ["/api/"] },
    sitemap: `${siteOrigin}/sitemap.xml`,
    host: siteOrigin,
  };
}
