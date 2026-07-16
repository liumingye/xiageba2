import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#shared/utils";
import { cutForSearch } from "#server/utils/jieba";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少参数 id" });
  }

  const query = getQuery(event);
  const similar = query.similar === "1" || query.similar === "true";

  const source = await prisma.source.findUnique({
    select: {
      id: true,
      title: true,
      createdAt: true,
      description: true,
      menu: true,
      url: true,
      isSelf: true,
    },
    where: { id },
  });

  if (!source) {
    throw createError({ statusCode: 404, message: "资源不存在" });
  }

  const type = getStorageType(source.url);

  const { url, ...rest } = source;
  const data = { ...rest, type };

  if (similar) {
    const tokens = cutForSearch(source.title);

    let similarList: Array<{
      id: string;
      title: string;
      type: string;
    }> = [];

    if (tokens.length > 0) {
      const formattedWebQuery = tokens.join(" OR ");

      const rows = await prisma.$queryRaw<
        Array<{ id: string; title: string; url: string }>
      >`
        SELECT id, title, url
        FROM "Source"
        WHERE id != ${id}
          AND "isTemp" = false
          AND status = 1
          AND "searchVector" @@ websearch_to_tsquery('simple', ${formattedWebQuery})
        ORDER BY ts_rank("searchVector", websearch_to_tsquery('simple', ${formattedWebQuery})) DESC
        LIMIT 10
      `;

      similarList = rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: getStorageType(r.url),
      }));
    }

    return {
      data,
      similar: similarList,
    };
  }

  return {
    data,
  };
});
