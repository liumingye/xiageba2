import { prisma } from "#server/lib/prisma";
import { getStorageType } from "#shared/utils";
import { truncateString } from "#server/utils/source";
import { TREE_MAX_LINE } from "#server/lib/const";

// 分页最大页数
const MAX_PAGE = 100;

export default defineCachedEventHandler(
  async (event) => {
    const id = event.context.params?.id;
    const cid = Number(id);

    if (!cid && (cid !== 0 || isNaN(cid))) {
      throw createError({ statusCode: 400, message: "无效的分类ID" });
    }

    const query = getQuery(event);
    const page = Math.min(
      MAX_PAGE,
      Math.max(1, parseInt(query.page as string) || 1),
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize as string) || 20),
    );
    const skip = (page - 1) * pageSize;

    // cid=0 表示不按分类筛选，返回所有资源
    const where =
      cid === 0
        ? { status: 1 }
        : { cid, status: 1 };

    const getTotalCount = async () => {
      if (cid === 0) {
        const [{ estimate }] = await prisma.$queryRaw<
          [{ estimate: bigint }]
        >`SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = 'Source'`;
        return Number(estimate);
      }

      // cid > 0 时走分类复合索引，数据量小，精准 count 性能极高 (< 1ms)
      return prisma.source.count({ where, take: MAX_PAGE * pageSize });
    };

    const [category, sources, total] = await Promise.all([
      cid === 0
        ? Promise.resolve({ id: 0, name: "最新资源", image: "", sort: 0 })
        : prisma.category.findUnique({ where: { id: cid } }),
      prisma.source.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          title: true,
          url: true,
          menu: true,
          createdAt: true,
          isSelf: true,
        },
      }),
      getTotalCount(),
    ]);

    if (!category) {
      throw createError({ statusCode: 404, message: "分类不存在" });
    }

    const items = sources.map((item) => ({
      id: item.id,
      title: item.title,
      menu: truncateString(item.menu || "", TREE_MAX_LINE),
      type: getStorageType(item.url),
      createdAt: item.createdAt,
      isSelf: item.isSelf,
    }));

    const totalPages = Math.min(MAX_PAGE, Math.ceil(total / pageSize));

    return {
      category,
      data: items,
      total: Math.min(total, MAX_PAGE * pageSize),
      page,
      pageSize,
      totalPages,
    };
  },
  {
    name: "api-category-id-v1",
    maxAge: 30,
    staleMaxAge: 120,
    swr: true,
    getKey: (event) => {
      const id = event.context.params?.id;
      const query = getQuery(event);
      return [id, query.page, query.pageSize]
        .map((value) => encodeURIComponent(String(value ?? "")))
        .join(":");
    },
  },
);
