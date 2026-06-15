import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ['query'] })

// 可选：监听查询事件来做自定义处理
prisma.$on('query', (e: any) => {
  console.log('查询:', e.query)
  console.log('参数:', e.params)
  console.log('耗时:', e.duration + 'ms')
  console.log('---')
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Math.max(1, parseInt(query.page as string) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(query.pageSize as string) || 10),
  );
  const skip = (page - 1) * pageSize;

  if (query.search) {
    const searchTerm = (query.search as string).trim();
    // 将搜索词用 & 连接，支持多词全文检索 + 前缀匹配
    // 例如 "周杰" -> to_tsquery('simple', '周杰:*')
    // 前缀匹配允许搜索部分词干，如 "周杰" 能匹配 "周杰伦"
    const terms = searchTerm.split(/\s+/).filter(Boolean);
    const tsQuery = terms.map(t => `${t}:*`).join(' & ');

    const [musics, totalResult] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT id, title, artist, album, cover, lyrics, "playUrl", downloads, "createdAt", "updatedAt"
        FROM "Music"
        WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
        ORDER BY "createdAt" DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `,
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM "Music"
        WHERE "searchVector" @@ to_tsquery('simple', ${tsQuery})
      `,
    ]);

    const total = Number(totalResult[0]?.count || 0);

    return {
      data: musics.map((m) => ({
        ...m,
        downloads: JSON.parse(m.downloads || "[]"),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  const [musics, total] = await Promise.all([
    prisma.music.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.music.count(),
  ]);

  return {
    data: musics.map((m) => ({
      ...m,
      downloads: JSON.parse(m.downloads || "[]"),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
});
