const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nuvello.app";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
