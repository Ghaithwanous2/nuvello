const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nuvello.app";

export default function sitemap() {
  const routes = ["", "/privacy", "/terms", "/contact", "/login", "/signup"];
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.6,
  }));
}
