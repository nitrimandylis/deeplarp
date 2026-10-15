import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Report pages carry their own noindex; only the home page is in the sitemap.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${SITE_URL}/sitemap.xml` };
}
