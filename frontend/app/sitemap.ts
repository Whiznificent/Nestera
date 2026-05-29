import { MetadataRoute } from "next";

const BASE_URL = "https://nestera.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/community",
    "/docs",
    "/features",
    "/goals",
    "/privacy",
    "/proposals/preview",
    "/savings",
    "/support",
    "/terms",
  ];

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.8,
  }));
}
