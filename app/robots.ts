import type { MetadataRoute } from "next";
import { isStagingDeployment, siteOrigin } from "./seo-config";

export default function robots(): MetadataRoute.Robots {
  if (isStagingDeployment) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${siteOrigin}/sitemap.xml`,
    host: siteOrigin,
  };
}
