import { prisma } from "#server/lib/prisma";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id;
  if (!id) {
    throw createError({ statusCode: 400, message: "缺少公告ID" });
  }

  const method = event.method;

  if (method === "PUT") {
    const body = await readBody(event);
    const { title, content, displayType, icon, sort, status } = body;

    if (!title?.trim()) {
      throw createError({ statusCode: 400, message: "标题不能为空" });
    }

    const data: any = {
      title: title.trim(),
      content: content || "",
    };
    if (displayType) data.displayType = displayType;
    if (icon) data.icon = icon;
    if (sort !== undefined) data.sort = parseInt(sort) || 0;
    if (status) data.status = status;

    const announcement = await prisma.announcement.update({
      where: { id },
      data,
    });

    return { success: true, data: announcement };
  }

  if (method === "DELETE") {
    await prisma.announcement.delete({ where: { id } });
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
