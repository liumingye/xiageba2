import { prisma } from "#server/lib/prisma";
import { parseBatchIds } from "#server/utils/admin";

/**
 * 资源批量操作
 *
 * - action=status：批量启用 / 禁用
 * - action=category：批量移动分类（cid 为空表示移出分类）
 * - action=delete：批量删除
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { action, status, cid } = body;

  // 非空 / 上限 / 过滤非法 id / 去重，与音乐侧同一套校验
  const idList = parseBatchIds(body.ids, "资源");

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
    let nextCid: number | null = null;
    if (cid !== null && cid !== undefined && cid !== "") {
      const parsedCid = Number(cid);
      if (!Number.isInteger(parsedCid) || parsedCid <= 0) {
        throw createError({ statusCode: 400, message: "分类 ID 不合法" });
      }
      nextCid = parsedCid;
    }
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
