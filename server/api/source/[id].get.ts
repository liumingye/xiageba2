import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#shared/utils";
import { cutForSearch, buildSearchWebQuery } from "#server/utils/jieba";
import { getCategoryNameMap } from "#server/lib/categoryCache";

/** 相关推荐候选集上限：先用索引截取，再对候选集排序 */
const SIMILAR_CANDIDATE_LIMIT = 200;

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
      cid: true,
      title: true,
      createdAt: true,
      description: true,
      menu: true,
      url: true,
      isSelf: true,
      status: true,
    },
    where: { id },
  });

  if (!source) {
    throw createError({ statusCode: 404, message: "资源不存在" });
  }

  const type = getStorageType(source.url);

  const { url, ...rest } = source;
  const data = { ...rest, type, cat: "" };

  if (source.cid) {
    const categoryMap = await getCategoryNameMap();
    if (categoryMap[source.cid]) {
      data.cat = categoryMap[source.cid] || "";
    }
  }

  if (similar) {
    const tokens = cutForSearch(source.title);

    let similarList: Array<{
      id: string;
      title: string;
      type: string;
    }> = [];

    if (tokens.length > 0) {
      const formattedWebQuery = buildSearchWebQuery(tokens, true);

      // ⚡ 两阶段查询：第一阶段不做 ts_rank 排序，借 GIN 索引最多取
      // CANDIDATE_LIMIT 条候选；第二阶段只对候选集算 rank 取前 10。
      // 直接 ORDER BY ts_rank 会让 PG 对全部命中行（可达数万）算分排序。
      // 代价：候选池无序，极端情况下最优结果可能落在候选池外——
      // 对「相关推荐」场景可接受。
      const rows = await prisma.$queryRaw<
        Array<{ id: string; title: string; url: string }>
      >`
        WITH q AS (
          SELECT to_tsquery('simple', ${formattedWebQuery}) AS value
        ),
        candidates AS (
          SELECT s.id, s.title, s.url, s."searchVector"
          FROM "Source" s, q
          WHERE s.id != ${id}
            AND s.status = 1
            AND s."searchVector" @@ q.value
          LIMIT ${SIMILAR_CANDIDATE_LIMIT}
        )
        SELECT c.id, c.title, c.url
        FROM candidates c, q
        ORDER BY ts_rank(c."searchVector", q.value) DESC
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
