import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const siteUrl = getRequestURL(event).origin;

  const [sources, musics] = await Promise.all([
    prisma.source.findMany({
      where: { isTemp: false, status: 1 },
      select: { id: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.music.findMany({
      select: { id: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const staticPages = [
    { loc: "/", changefreq: "daily", priority: "1.0" },
  ];

  const urls = [
    ...staticPages.map(
      (p) => `  <url>
    <loc>${siteUrl}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
    ),
    ...sources.map(
      (s) => `  <url>
    <loc>${siteUrl}/source/${s.id}</loc>
    <lastmod>${(s.updatedAt || s.createdAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
    ),
    ...musics.map(
      (m) => `  <url>
    <loc>${siteUrl}/music/${m.id}</loc>
    <lastmod>${(m.updatedAt || m.createdAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  setResponseHeader(event, "content-type", "application/xml");
  return xml;
});
