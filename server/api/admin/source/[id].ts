import { prisma } from "#server/lib/prisma";
import { clearTreeSymbols } from "#server/utils/source";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;
  const method = event.method;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少资源ID" });
  }

  if (method === "PUT") {
    const body = await readBody(event);
    const { cid, title, url, description, menu } = body;

    if (!title?.trim()) {
      throw createError({ statusCode: 400, message: "资源名称不能为空" });
    }
    if (!url?.trim()) {
      throw createError({ statusCode: 400, message: "资源地址不能为空" });
    }

    const source = await prisma.source.update({
      where: { id },
      data: {
        cid: Number(cid) || null,
        title: title.trim(),
        url: url.trim(),
        description: description || "",
        menu: menu || "",
      },
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
