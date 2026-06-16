import prisma from "~/lib/prisma";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const term = (query.q as string)?.trim() || "";
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(query.pageSize as string) || 10),
  );
  const skip = (page - 1) * pageSize;

  if (!term) {
    return { data: [], total: 0, page: 1, pageSize, totalPages: 0 };
  }

  const chars = [...term];
  const bigrams: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== " ") bigrams.push(chars[i]);
    if (
      i < chars.length - 1 &&
      chars[i] !== " " &&
      chars[i + 1] !== " "
    ) {
      bigrams.push(chars[i] + chars[i + 1]);
    }
  }
  const tsQuery = bigrams.join(" & ");

  const [musics, total] = await Promise.all([
    prisma.$queryRaw<
      any[]
    >`SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
       FROM "Music"
       WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
       ORDER BY "createdAt" DESC
       LIMIT ${pageSize} OFFSET ${skip}`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
       FROM "Music"
       WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})`,
  ]);

  const totalCount = Number((total as any)[0]?.count || 0);

  return {
    data: musics.map((m) => ({
      ...m,
      downloads: JSON.parse(m.downloads || "[]"),
    })),
    total: totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
});
