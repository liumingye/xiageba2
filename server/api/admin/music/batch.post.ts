import { prisma } from "#server/lib/prisma";
import { parseBatchIds } from "#server/utils/admin";

/**
 * 音乐批量操作
 *
 * - action=status：批量启用 / 禁用
 * - action=delete：批量删除
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { action, status } = body;

  // 非空 / 上限 / 过滤非法 id / 去重，与资源侧同一套校验
  const idList = parseBatchIds(body.ids, "音乐");

  if (action === "status") {
    const s = Number(status);
    if (s !== 0 && s !== 1) {
      throw createError({ statusCode: 400, message: "无效的状态值" });
    }
    const result = await prisma.music.updateMany({
      where: { id: { in: idList } },
      data: { status: s },
    });
    return { success: true, count: result.count };
  }

  if (action === "delete") {
    const result = await prisma.music.deleteMany({
      where: { id: { in: idList } },
    });
    return { success: true, count: result.count };
  }

  throw createError({ statusCode: 400, message: "不支持的操作类型" });
});
