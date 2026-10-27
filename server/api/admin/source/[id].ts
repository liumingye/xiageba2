import { prisma } from "#server/lib/prisma";
import { clearTreeSymbols } from "#server/utils/source";
import { buildTokens } from "#server/utils/jieba";
import { TREE_MAX_LINE } from "#server/lib/const";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;
  const method = event.method;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少资源ID" });
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { cid, title, url, description, menu, status, isSelf } = body;

    const data: any = {};
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        throw createError({ statusCode: 400, message: "资源名称不能为空" });
      }
      data.title = title.trim();
    }
    if (url !== undefined) {
      if (typeof url !== "string" || !url.trim()) {
        throw createError({ statusCode: 400, message: "资源链接不能为空" });
      }
      data.url = url.trim();
    }
    if (cid !== undefined) {
      if (cid === null || cid === "") {
        data.cid = null;
      } else {
        const parsedCid = Number(cid);
        if (!Number.isInteger(parsedCid) || parsedCid <= 0) {
          throw createError({ statusCode: 400, message: "分类 ID 不合法" });
        }
        data.cid = parsedCid;
      }
    }
    if (description !== undefined) {
      if (typeof description !== "string") {
        throw createError({ statusCode: 400, message: "资源描述格式错误" });
      }
      data.description = description;
    }
    if (menu !== undefined) {
      if (typeof menu !== "string") {
        throw createError({ statusCode: 400, message: "目录数据格式错误" });
      }
      data.menu = menu;
    }
    if (status !== undefined) {
      const parsedStatus = Number(status);
      if (parsedStatus !== 0 && parsedStatus !== 1) {
        throw createError({ statusCode: 400, message: "资源状态不合法" });
      }
      data.status = parsedStatus;
    }
    if (isSelf !== undefined) data.isSelf = Boolean(isSelf);

    const needsVectorRebuild =
      title !== undefined ||
      url !== undefined ||
      description !== undefined ||
      menu !== undefined;

    const source = await prisma.$transaction(async (tx) => {
      const updated = await tx.source.update({ where: { id }, data });

      // 标题/描述/目录变化时重建索引；清空内容也要写回空向量，
      // 否则旧向量会继续命中已删除的关键词。
      if (needsVectorRebuild) {
        const tokens = buildTokens(
          updated.title || "",
          updated.description || "",
          truncateString(clearTreeSymbols(updated.menu || ""), TREE_MAX_LINE),
        );
        await tx.$executeRaw`UPDATE "Source" SET "searchVector" = to_tsvector('simple', ${tokens || ""}) WHERE id = ${updated.id}`;
      }
      return updated;
    });

    return { success: true, data: source };
  }

  if (method === "DELETE") {
    await prisma.source.delete({ where: { id } });
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
