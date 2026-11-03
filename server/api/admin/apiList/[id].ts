import { prisma } from "#server/lib/prisma";
import { normalizeApiListBody } from "#server/lib/apiList";

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string;
  const method = event.method;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少ID" });
  }

  if (method === "PUT") {
    const body = await readBody(event);
    // 与新建共用同一套字段规则（原两份逐字重复的 normalizeBody）
    const data = normalizeApiListBody(body);

    if (!data.name) {
      throw createError({ statusCode: 400, message: "线路名称不能为空" });
    }
    if (!data.url) {
      throw createError({ statusCode: 400, message: "地址不能为空" });
    }

    const item = await prisma.apiList.update({ where: { id }, data });
    return { success: true, data: item };
  }

  if (method === "DELETE") {
    await prisma.apiList.delete({ where: { id } });
    return { success: true };
  }

  throw createError({ statusCode: 405, message: "不支持的请求方法" });
});
