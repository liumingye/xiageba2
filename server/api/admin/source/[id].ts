import { prisma } from "#server/lib/prisma";
import { clearTreeSymbols } from "#server/utils/source";
import { buildTokens } from "#server/utils/jieba";

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
    if (title) data.title = title.trim();
    if (url) data.url = url.trim();
    if (cid !== undefined) data.cid = Number(cid) || null;
    if (description !== undefined) data.description = description || "";
    if (menu !== undefined) data.menu = menu || "";
    if (status !== undefined) data.status = Number(status) ?? 1;
    if (isSelf !== undefined) data.isSelf = isSelf;

    const source = await prisma.source.update({
      where: { id },
      data,
    });

    // jieba 分词后更新 searchVector
    const tokens = buildTokens(
      source.title || "",
      source.description || "",
      clearTreeSymbols(source.menu || ""),
    );
    if (tokens) {
      await prisma.$executeRaw`UPDATE "Source" SET "searchVector" = to_tsvector('simple', ${tokens}) WHERE id = ${source.id}`;
    }

    return { success: true, data: source };
  }

  if (method === "DELETE") {
    await prisma.source.delete({ where: { id } });
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
