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
    const term = (query.search as string).trim();

    // 把搜索词按字符 bigram 拆分 → '周杰伦' → '周杰 & 杰伦'
    // 与数据库中 chinese_bigram() 函数生成的 tsvector 匹配
    const chars = [...term];
    const bigrams = [];
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] !== ' ') bigrams.push(chars[i]);          // 单字
      if (i < chars.length - 1 && chars[i] !== ' ' && chars[i + 1] !== ' ') {
        bigrams.push(chars[i] + chars[i + 1]);                 // bigram
      }
    }
    const tsQuery = bigrams.join(' & ');

    // PG FTS: searchVector @@ to_tsquery('simple', '周杰 & 杰伦')
    // 走 searchVector 上的 GIN 索引，O(log n)
    const [musics, total] = await Promise.all([
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
