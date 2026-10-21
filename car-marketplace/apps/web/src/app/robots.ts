import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Personal and transactional pages; filtered and sorted searches carry noindex instead.
      disallow: ["/account", "/sell", "/admin", "/login", "/api/"],
    },
    sitemap: new URL("/sitemap.xml", env.siteUrl).toString(),
  };
}
