import type { MetadataRoute } from "next";

/**
 * Let the app's pages be indexed; keep crawlers out of the API. The sync
 * endpoint in particular serves nothing a crawler should fetch, and every
 * hit counts against its rate budget.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
  };
}
