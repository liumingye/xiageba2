import { prisma } from "#server/lib/prisma";

// 单次批量操作上限，防止误提交超大请求
const BATCH_MAX = 1000;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { action, ids, status, cid } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, message: "缺少资源ID列表" });
  }
  if (ids.length > BATCH_MAX) {
    throw createError({
      statusCode: 400,
      message: `单次最多操作 ${BATCH_MAX} 条`,
    });
  }
  // 过滤非法 id，去重
  const idList = [...new Set(ids.filter((id: unknown) => typeof id === "string" && id))];

  if (idList.length === 0) {
    throw createError({ statusCode: 400, message: "资源ID列表为空" });
  }

  if (action === "status") {
    const s = Number(status);
    if (s !== 0 && s !== 1) {
      throw createError({ statusCode: 400, message: "无效的状态值" });
    }
    const result = await prisma.source.updateMany({
      where: { id: { in: idList } },
      data: { status: s },
    });
    return { success: true, count: result.count };
  }

  if (action === "category") {
    const nextCid =
      cid === null || cid === undefined || cid === "" ? null : Number(cid) || null;
    const result = await prisma.source.updateMany({
      where: { id: { in: idList } },
      data: { cid: nextCid },
    });
    return { success: true, count: result.count };
  }

  if (action === "delete") {
    const result = await prisma.source.deleteMany({
      where: { id: { in: idList } },
    });
    return { success: true, count: result.count };
  }

  throw createError({ statusCode: 400, message: "不支持的操作类型" });
});
